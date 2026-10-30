export function planTask(task, provider) {
  if (task.errors.length) throw new Error(task.errors.join('；'));
  const source = task.override || task.data.具体要求;
  const inputs = [...new Set([task.data.要处理的图片, ...task.data.参考图编号])];
  const mapping = inputs.map((global, index) => ({ global, local: `图片${index + 1}`, role: index === 0 ? '主图' : '参考图', file: task.assets[global] }));
  const local = Object.fromEntries(mapping.map(row => [row.global, row.local]));
  const template = provider?.promptTemplate || '{{prompt}}';
  if (!template.includes('{{prompt}}')) throw new Error('提示词模板必须包含 {{prompt}}');
  const combined = template.replaceAll('{{prompt}}', () => source);
  const converted = combined.replace(/@图片[0-9]+/g, token => {
    const value = local[token.slice(1)]; if (!value) throw new Error(`提示词引用不在本次输入中：${token}`); return '@' + value;
  });
  const body = provider?.referenceStyle === 'ordinal' ? converted.replace(/@图片([0-9]+)/g, '第$1张输入图片') : converted;
  const legend = mapping.map((row, i) => `输入图片${i + 1}：${row.role}`).join('；');
  const ratio = task.data.输出比例;
  return { mapping, originalPrompt: task.data.具体要求, effectivePrompt: source, prompt: `${legend}。\n${body}${ratio ? `\n输出图片比例：${ratio}。` : ''}`, ratio };
}
