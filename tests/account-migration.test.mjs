import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../server.mjs';
import { defaultProviders, CATALOG_VERSION, MODEL_BINDINGS, RUNNINGHUB_BASE } from '../lib/catalog.mjs';
import { secret } from '../lib/secrets.mjs';
import { providerErrors, loadInputs } from '../lib/providers.mjs';
import { png } from '../scripts/fixtures.mjs';

const base = path.resolve('test-output');
fs.mkdirSync(base, { recursive: true });

function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(base, 'account-migration-'));
  t.after(() => {
    const resolved = path.resolve(dir);
    assert.ok(resolved.startsWith(base + path.sep));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return dir;
}

function oldState(providers, jobs = []) {
  return {
    version: 3, catalogVersion: CATALOG_VERSION, baseUrl: RUNNINGHUB_BASE,
    concurrency: 1, paused: true, bindings: { ...MODEL_BINDINGS },
    providers, tasks: {}, jobs,
  };
}

function assertPublicCredentialState(snapshot, hasKey) {
  assert.equal(snapshot.hasKey, hasKey);
  assert.equal(typeof snapshot.credentialNotice, 'string');
  assert.doesNotMatch(JSON.stringify(snapshot), /keyCipher|aes1\./);
  for (const provider of snapshot.providers) {
    assert.equal(Object.hasOwn(provider, 'keyCipher'), false);
    assert.equal(Object.hasOwn(provider, 'apiKey'), false);
  }
}

function assertProfilesHaveNoKeys(providers) {
  for (const provider of providers) {
    assert.equal(Object.hasOwn(provider, 'keyCipher'), false);
    assert.equal(Object.hasOwn(provider, 'apiKey'), false);
  }
}

test('新账户使用 v4 顶层共享凭据，公共状态只公开保存状态', async t => {
  const dir = sandbox(t);
  const app = createApp({ dataDir: dir });
  try {
    assert.equal(app.state().version, 4);
    assert.equal(typeof app.state().keyCipher, 'string');
    assertProfilesHaveNoKeys(app.state().providers);
    assertPublicCredentialState(app.snapshot(), false);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
    assert.equal(saved.version, 4);
    assert.equal(typeof saved.keyCipher, 'string');
    assertProfilesHaveNoKeys(saved.providers);
  } finally {
    await app.close();
  }
});

test('已有 v4 共享 Key 在重新读取后保留，密文不出现在公共快照', async t => {
  const dir = sandbox(t);
  const value = 'single-account-key-for-test';
  const cipher = await secret(value, false, dir);
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({
    ...oldState(defaultProviders()), version: 4, keyCipher: cipher,
  }));
  const app = createApp({ dataDir: dir });
  try {
    assert.equal(app.state().version, 4);
    assert.equal(await secret(app.state().keyCipher, true, dir), value);
    assertProfilesHaveNoKeys(app.state().providers);
    assertPublicCredentialState(app.snapshot(), true);
    assert.doesNotMatch(JSON.stringify(app.snapshot()), /single-account-key-for-test/);
  } finally {
    await app.close();
  }
});

test('v3 两模型密文不同但明文相同，迁移时自动合并为共享 Key', async t => {
  const dir = sandbox(t);
  const value = 'same-account-key-for-migration';
  const first = await secret(value, false, dir);
  const second = await secret(value, false, dir);
  assert.notEqual(first, second, 'AES 随机 IV 会产生不同密文，迁移不能只比较密文');
  const providers = defaultProviders().map((provider, index) => ({
    ...provider, keyCipher: index === 0 ? first : second,
  }));
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(oldState(providers)));
  const app = createApp({ dataDir: dir });
  try {
    assert.equal(app.state().version, 4);
    assert.equal(await secret(app.state().keyCipher, true, dir), value);
    assertProfilesHaveNoKeys(app.state().providers);
    assertPublicCredentialState(app.snapshot(), true);
    assert.equal(app.snapshot().credentialNotice, '');
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
    assert.equal(saved.version, 4);
    assert.equal(await secret(saved.keyCipher, true, dir), value);
    assertProfilesHaveNoKeys(saved.providers);
  } finally {
    await app.close();
  }
});

test('v3 不同 Key 不被擅自选用，旧远程任务仍保留原凭据以便恢复', async t => {
  const dir = sandbox(t);
  const first = await secret('legacy-nano-account-key', false, dir);
  const second = await secret('legacy-gpt-account-key', false, dir);
  const providers = defaultProviders().map((provider, index) => ({
    ...provider, keyCipher: index === 0 ? first : second,
  }));
  const job = {
    id: 'legacy-job', taskId: 'legacy-task', taskNumber: 'T001',
    folder: dir, category: '局部重绘-gpt', status: 'failed',
    provider: { ...providers[1] }, baseUrl: RUNNINGHUB_BASE,
    remoteId: 'remote-task-already-submitted',
    plan: { prompt: '处理@图片1', mapping: [], ratio: null },
    createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z',
  };
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(oldState(providers, [job])));
  const app = createApp({ dataDir: dir });
  try {
    assert.equal(app.state().version, 4);
    assert.equal(app.state().keyCipher, '');
    assertProfilesHaveNoKeys(app.state().providers);
    const snapshot = app.snapshot();
    assertPublicCredentialState(snapshot, false);
    assert.ok(snapshot.credentialNotice.trim(), '旧 Key 冲突必须有可见提示');
    assert.equal(snapshot.jobs[0].remoteId, job.remoteId);
    assert.equal(snapshot.jobs[0].canResume, true);
    const savedJob = app.state().jobs[0];
    assert.equal(savedJob.provider.keyCipher, second);
    assert.equal(await secret(savedJob.provider.keyCipher, true, dir), 'legacy-gpt-account-key');
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
    assert.equal(saved.jobs[0].provider.keyCipher, second);
    assert.doesNotMatch(JSON.stringify(snapshot), /legacy-nano-account-key|legacy-gpt-account-key/);
  } finally {
    await app.close();
  }
});

test('比例校验跟随实际模型，null 不产生额外比例要求', () => {
  const nano = defaultProviders().find(provider => provider.id === 'gemini');
  const gpt = defaultProviders().find(provider => provider.id === 'gpt');
  const plan = ratio => ({ prompt: '处理@图片1', mapping: [{ global: '图片1', local: '图片1' }], ratio });
  assert.deepEqual(providerErrors(nano, plan('8:1')), []);
  assert.ok(providerErrors(nano, plan('9:21')).length);
  assert.deepEqual(providerErrors(gpt, plan('9:21')), []);
  assert.ok(providerErrors(gpt, plan('8:1')).length);
  for (const provider of [nano, gpt]) assert.deepEqual(providerErrors(provider, plan(null)), []);
});

test('两模型验证最终提示词 1 至 20000 字符边界', () => {
  for (const provider of defaultProviders()) {
    const plan = prompt => ({ prompt, mapping: [{ global: '图片1', local: '图片1' }], ratio: null });
    assert.ok(providerErrors(provider, plan('')).length);
    assert.deepEqual(providerErrors(provider, plan('字'.repeat(20000))), []);
    assert.ok(providerErrors(provider, plan('字'.repeat(20001))).length);
  }
});

test('读取素材执行所选模型 30MB / 50MB 单图限制', t => {
  const dir = sandbox(t);
  const file = path.join(dir, '图片1.png');
  const writeImage = bytes => {
    fs.writeFileSync(file, png());
    fs.truncateSync(file, bytes);
  };
  const plan = { mapping: [{ global: '图片1', local: '图片1', file }] };
  const mb = 1024 * 1024;
  writeImage(30 * mb + 1);
  assert.throws(() => loadInputs(plan, 10, dir, 30 * mb), /30|过大|上限/);
  const inputs = loadInputs(plan, 10, dir, 50 * mb);
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].bytes.length, 30 * mb + 1);
  writeImage(50 * mb + 1);
  assert.throws(() => loadInputs(plan, 10, dir, 50 * mb), /50|过大|上限/);
});
