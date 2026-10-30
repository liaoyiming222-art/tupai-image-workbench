using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Drawing;
using System.Reflection;
using System.Web.Script.Serialization;
using System.Windows.Forms;
internal static class Launcher {
 static readonly string Root=AppDomain.CurrentDomain.BaseDirectory;
 const string Url="http://127.0.0.1:5137";
 static readonly object LogLock=new object();
 static string Health(){try{var req=(HttpWebRequest)WebRequest.Create(Url+"/api/state");req.Timeout=1400;req.Proxy=null;using(var response=req.GetResponse())using(var reader=new StreamReader(response.GetResponseStream())){string s=reader.ReadToEnd();if(s.Contains("\"appName\":\"local-image-workbench\""))return s;}}catch{}return null;}
 static string Node(){
  string local=Path.Combine(Root,"runtime","node.exe");if(File.Exists(local))return local;
  foreach(var dir in (Environment.GetEnvironmentVariable("PATH")??"").Split(Path.PathSeparator)){try{string file=Path.Combine(dir.Trim('"'),"node.exe");if(File.Exists(file))return file;}catch{}}
  string bundled=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),".cache","codex-runtimes","codex-primary-runtime","dependencies","node","bin","node.exe");
  if(File.Exists(bundled))return bundled;
  throw new Exception("未找到 Node.js。请安装 Node.js 22 或更新版本后再打开图派。\n下载：https://nodejs.org/");
 }
 static void Log(string value){try{lock(LogLock){Directory.CreateDirectory(Path.Combine(Root,".local"));File.AppendAllText(Path.Combine(Root,".local","launcher.log"),value+Environment.NewLine,Encoding.UTF8);}}catch{}}
 static void StartServer(){
  var version=new ProcessStartInfo(Node(),"--version"){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true};
  using(var p=Process.Start(version)){string v=p.StandardOutput.ReadToEnd().Trim().TrimStart('v');if(!p.WaitForExit(10000)||new Version(v).Major<22)throw new Exception("需要 Node.js 22 或更新版本。");}
  var info=new ProcessStartInfo(Node(),"\""+Path.Combine(Root,"scripts","boot-local.mjs")+"\""){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Root,RedirectStandardOutput=true,RedirectStandardError=true};
  var server=new Process();server.StartInfo=info;server.OutputDataReceived+=(s,e)=>{if(e.Data!=null)Log(e.Data);};server.ErrorDataReceived+=(s,e)=>{if(e.Data!=null)Log(e.Data);};
  server.Start();server.BeginOutputReadLine();server.BeginErrorReadLine();
  for(int i=0;i<50;i++){if(Health()!=null)return;if(server.HasExited&&server.ExitCode!=0)throw new Exception("本地服务启动失败，请查看 .local/service.log 和 .local/launcher.log。");Thread.Sleep(250);}
  throw new Exception("本地服务尚未就绪，请稍后重试；详情见 .local/service.log。可能是端口已被其他程序占用。");
 }
 static void OpenWindow(){
  string edge=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),"Microsoft","Edge","Application","msedge.exe");
  if(!File.Exists(edge))edge=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"Microsoft","Edge","Application","msedge.exe");
  if(File.Exists(edge))Process.Start(new ProcessStartInfo(edge,"--app=\""+Url+"\""){UseShellExecute=true});
  else Process.Start(new ProcessStartInfo(Url){UseShellExecute=true});
 }
 static void Shortcut(){
  string desktop=Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
  var shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
  var link=shell.GetType().InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,new object[]{Path.Combine(desktop,"图派.lnk")});
  var type=link.GetType();type.InvokeMember("TargetPath",BindingFlags.SetProperty,null,link,new object[]{Path.Combine(Root,"图派启动器.exe")});
  type.InvokeMember("WorkingDirectory",BindingFlags.SetProperty,null,link,new object[]{Root});
  type.InvokeMember("IconLocation",BindingFlags.SetProperty,null,link,new object[]{Path.Combine(Root,"图派启动器.exe")+",0"});
  type.InvokeMember("Description",BindingFlags.SetProperty,null,link,new object[]{"图派 · 本地 AI 批量作图工作台"});
  type.InvokeMember("Save",BindingFlags.InvokeMethod,null,link,null);
 }
 static void Stop(){
  string status=Health();if(status==null)return;
  var data=new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(status);
  var req=(HttpWebRequest)WebRequest.Create(Url+"/api/shutdown");req.Proxy=null;req.Timeout=10000;req.Method="POST";req.ContentType="application/json";req.Headers["X-Local-Token"]=(string)data["token"];
  byte[] bytes=Encoding.UTF8.GetBytes("{}");req.ContentLength=bytes.Length;using(var stream=req.GetRequestStream())stream.Write(bytes,0,bytes.Length);
  try{using(var response=req.GetResponse()){} }catch(WebException e){if(e.Response!=null)throw new Exception("仍有任务正在处理，请先暂停队列并等待当前任务结束，再退出服务。");throw;}
 }
 static void MakeIcon(string file){
  using(var bmp=new Bitmap(64,64))using(var g=Graphics.FromImage(bmp)){
   g.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;g.Clear(Color.FromArgb(28,72,56));
   using(var b=new SolidBrush(Color.FromArgb(140,170,133)))g.FillRectangle(b,13,19,32,31);
   using(var b=new SolidBrush(Color.FromArgb(242,230,189)))g.FillRectangle(b,20,12,32,31);
   using(var b=new SolidBrush(Color.FromArgb(57,107,77)))g.FillPolygon(b,new Point[]{new Point(25,35),new Point(33,25),new Point(39,32),new Point(43,28),new Point(48,35)});
   using(var b=new SolidBrush(Color.FromArgb(182,198,154)))g.FillEllipse(b,41,18,6,6);
   using(var b=new SolidBrush(Color.FromArgb(242,230,189)))g.FillPolygon(b,new Point[]{new Point(48,44),new Point(51,49),new Point(57,50),new Point(52,54),new Point(51,60),new Point(47,55),new Point(41,54),new Point(46,50)});
   using(var icon=Icon.FromHandle(bmp.GetHicon()))using(var stream=File.Create(file))icon.Save(stream);
  }
 }
 [STAThread] static int Main(string[] args){
  try{
   if(args.Length>0&&args[0]=="--self-test"){Console.Write("TUPAI_LAUNCHER_READY");return 0;}
   if(args.Length==2&&args[0]=="--make-icon"){MakeIcon(args[1]);return 0;}
   if(args.Length>0&&args[0]=="--install-shortcut"){Shortcut();return 0;}
   if(args.Length>0&&args[0]=="--stop"){Stop();return 0;}
   using(var mutex=new Mutex(false,"Local\\TupaiLocalLauncher")){
    if(!mutex.WaitOne(0))return 0;
    try{if(!File.Exists(Path.Combine(Root,"server.mjs")))throw new Exception("请将启动器保留在图派项目文件夹中，不要单独移动 exe；可使用桌面快捷方式。");if(Health()==null)StartServer();OpenWindow();}finally{mutex.ReleaseMutex();}
   }return 0;
  }catch(Exception e){if(args.Length>0&&args[0]=="--self-test")return 1;MessageBox.Show(e.Message,"图派",MessageBoxButtons.OK,MessageBoxIcon.Information);return 1;}
 }
}
