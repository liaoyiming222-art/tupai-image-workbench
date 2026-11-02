using System;
using System.IO;
using System.Text;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using System.Collections.Generic;
public static class FolderPicker {
 [DllImport("shell32.dll",CharSet=CharSet.Unicode)] static extern int SHCreateItemFromParsingName(string p,IntPtr b,ref Guid iid,[MarshalAs(UnmanagedType.Interface)] out object item);
 [DllImport("shell32.dll",CharSet=CharSet.Unicode)] static extern IntPtr ShellExecute(IntPtr h,string verb,string file,string args,string dir,int show);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string c,string title);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr h,int cmd);
 [DllImport("user32.dll")] static extern IntPtr GetProcessWindowStation();
 [DllImport("user32.dll")] static extern IntPtr GetThreadDesktop(uint thread);
 [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr h,int index,StringBuilder text,int size,out int needed);
 static string ObjectName(IntPtr handle){var text=new StringBuilder(512);int needed;return GetUserObjectInformation(handle,2,text,1024,out needed)?text.ToString():"unknown";}
 static string DesktopInfo(){return ObjectName(GetProcessWindowStation())+"/"+ObjectName(GetThreadDesktop(GetCurrentThreadId()));}
 [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
 [StructLayout(LayoutKind.Sequential)] struct Rect {public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window,out Rect rect);
 [DllImport("user32.dll",EntryPoint="GetWindowLongW")] static extern int GetWindowLong(IntPtr window,int index);
 static void BringPickerToFront(IntPtr window,bool restore=false){
  // Never show/restore a dialog while the Shell is still constructing its layout.
  if(restore&&IsIconic(window))ShowWindowAsync(window,9);
  SetWindowPos(window,new IntPtr(-1),0,0,0,0,0x0001|0x0002|0x0010);
  SetForegroundWindow(window);
 }
 static void FocusPicker(){IntPtr h=FindWindow(null,"图派 · 选择需求文件夹");if(h!=IntPtr.Zero)BringPickerToFront(h,true);}
 [ComImport,Guid("00000114-0000-0000-C000-000000000046"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface OleWindow {[PreserveSig]int GetWindow(out IntPtr window);[PreserveSig]int ContextSensitiveHelp([MarshalAs(UnmanagedType.Bool)]bool enter);}
 [ComVisible(true),Guid("973510db-7d7f-452b-8975-74a85828d354"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 public interface DialogEvents {
  [PreserveSig]int OnFileOk(Dialog dialog);
  [PreserveSig]int OnFolderChanging(Dialog dialog,Item folder);
  [PreserveSig]int OnFolderChange(Dialog dialog);
  [PreserveSig]int OnSelectionChange(Dialog dialog);
  [PreserveSig]int OnShareViolation(Dialog dialog,Item item,out uint response);
  [PreserveSig]int OnTypeChange(Dialog dialog);
  [PreserveSig]int OnOverwrite(Dialog dialog,Item item,out uint response);
 }
 [ComVisible(true),ClassInterface(ClassInterfaceType.None)]
 public sealed class ReadyEvents:DialogEvents,IDisposable {
  readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();
  IntPtr handle;bool raised;int attempts,stable;Rect previous;
  public ReadyEvents(){timer.Interval=50;timer.Tick+=(sender,args)=>{
   if(++attempts>100){timer.Stop();return;}
   Rect rect;if(!IsWindowVisible(handle)||!GetWindowRect(handle,out rect)||rect.Right-rect.Left<200||rect.Bottom-rect.Top<200)return;
   if(rect.Left!=previous.Left||rect.Top!=previous.Top||rect.Right!=previous.Right||rect.Bottom!=previous.Bottom){previous=rect;stable=0;return;}
   if(++stable<2)return;
   timer.Stop();BringPickerToFront(handle);raised=true;
   if(Environment.GetEnvironmentVariable("TUPAI_PICKER_TRACE")=="1")Console.Error.WriteLine("PICKER_READY "+(rect.Right-rect.Left)+"x"+(rect.Bottom-rect.Top)+" topmost="+((GetWindowLong(handle,-20)&8)!=0));
  };}
  public void Dispose(){timer.Stop();timer.Dispose();}
  public int OnFolderChange(Dialog dialog){
   if(raised||handle!=IntPtr.Zero)return 0;
   try{IntPtr window;if(((OleWindow)dialog).GetWindow(out window)==0&&window!=IntPtr.Zero){handle=window;timer.Start();}}catch(COMException){}
   return 0;
  }
  public int OnFileOk(Dialog dialog){return 0;}
  public int OnFolderChanging(Dialog dialog,Item folder){return 0;}
  public int OnSelectionChange(Dialog dialog){return 0;}
  public int OnShareViolation(Dialog dialog,Item item,out uint response){response=0;return 0;}
  public int OnTypeChange(Dialog dialog){return 0;}
  public int OnOverwrite(Dialog dialog,Item item,out uint response){response=0;return 0;}
 }
 static int ShowInFront(Dialog dialog){
  var events=new ReadyEvents();uint cookie;dialog.Advise(events,out cookie);
  try{return dialog.Show(IntPtr.Zero);}finally{dialog.Unadvise(cookie);events.Dispose();GC.KeepAlive(events);}
 }
 static string Json(object value){return new JavaScriptSerializer().Serialize(value);}
 [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);
 [StructLayout(LayoutKind.Sequential)] struct Size {public int X,Y;}
 [ComImport,Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface ImageFactory { void GetImage(Size size,uint flags,out IntPtr bitmap); }
 [ComImport,Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 public interface Item {void BindToHandler(IntPtr a,ref Guid b,ref Guid c,out IntPtr d);void GetParent(out Item p);void GetDisplayName(uint kind,out IntPtr name);}
 [ComImport,Guid("d57c7288-d4ad-4768-be02-9d969532d960"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 public interface Dialog {
  [PreserveSig] int Show(IntPtr owner);
  void SetFileTypes(uint n,IntPtr types);void SetFileTypeIndex(uint n);void GetFileTypeIndex(out uint n);
  void Advise([MarshalAs(UnmanagedType.Interface)]DialogEvents a,out uint b);void Unadvise(uint a);
  void SetOptions(uint flags);void GetOptions(out uint flags);
  void SetDefaultFolder(Item item);void SetFolder(Item item);void GetFolder(out Item item);void GetCurrentSelection(out Item item);
  void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);void GetFileName(out IntPtr name);
  void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
  void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
  void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
  void GetResult(out Item item);
  void AddPlace(Item item,uint placement);void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string value);void Close(int hr);void SetClientGuid(ref Guid guid);void ClearClientData();void SetFilter(IntPtr filter);
  void GetResults(out ItemArray items);void GetSelectedItems(out ItemArray items);
 }
 [ComImport,Guid("b63ea76d-1f85-456f-a19c-48159efa858b"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 public interface ItemArray {void BindToHandler(IntPtr a,ref Guid b,ref Guid c,out IntPtr d);void GetPropertyStore(uint flags,ref Guid iid,out IntPtr store);void GetPropertyDescriptionList(IntPtr key,ref Guid iid,out IntPtr list);void GetAttributes(uint flags,uint mask,out uint attrs);void GetCount(out uint count);void GetItemAt(uint index,out Item item);void EnumItems(out IntPtr enumerator);}
 static void Thumbnail(string input,string output) {
  object factory=null;IntPtr bitmap=IntPtr.Zero;
  try{
   Guid iid=typeof(ImageFactory).GUID;Marshal.ThrowExceptionForHR(SHCreateItemFromParsingName(input,IntPtr.Zero,ref iid,out factory));
   ((ImageFactory)factory).GetImage(new Size{X=144,Y=144},9,out bitmap);
   using(var image=Image.FromHbitmap(bitmap)) SaveSmall(image,output);
  }catch{
   using(var image=Image.FromFile(input)) SaveSmall(image,output);
  }finally{if(bitmap!=IntPtr.Zero)DeleteObject(bitmap);if(factory!=null)Marshal.ReleaseComObject(factory);}
 }
 static void SaveSmall(Image image,string output) {
  double scale=Math.Min(1,144.0/Math.Max(image.Width,image.Height));
  using(var small=new Bitmap(Math.Max(1,(int)(image.Width*scale)),Math.Max(1,(int)(image.Height*scale))))
  using(var g=Graphics.FromImage(small)){
   g.Clear(Color.White);g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;g.DrawImage(image,0,0,small.Width,small.Height);
   small.Save(output,ImageFormat.Jpeg);
  }
 }
 [STAThread] static int Main(string[] args) {
  Console.SetOut(new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false)){AutoFlush=true});
  if(args.Length>0&&args[0]=="--self-test"){Console.Write("NATIVE_FOLDER_PICKER_READY");return 0;}
  try{
   if(args.Length>0&&args[0]=="--desktop-info"){Console.Write(DesktopInfo());return 0;}
   if(args.Length==3&&args[0]=="--thumbnail"){Thumbnail(args[1],args[2]);return 0;}
   if(args.Length==2&&args[0]=="--open-folder"){
    if(!Directory.Exists(args[1]))throw new IOException();
    long result=ShellExecute(IntPtr.Zero,"open",Path.GetFullPath(args[1]),null,null,1).ToInt64();
    if(result<=32)throw new IOException();return 0;
   }
   if(args.Length>0&&args[0]=="--focus-picker"){FocusPicker();return 0;}
   if((args.Length==0||args[0]=="--clipboard"||Directory.Exists(args[0]))&&!DesktopInfo().EndsWith("/Default",StringComparison.OrdinalIgnoreCase)){Console.Error.Write("DESKTOP_NOT_INTERACTIVE");return 3;}
   if(args.Length>0&&args[0]=="--clipboard"){
    try{if(Clipboard.ContainsFileDropList()){var rows=new List<string>();foreach(string item in Clipboard.GetFileDropList())rows.Add(item);Console.Write(Json(new{paths=rows,text=""}));}else Console.Write(Json(new{paths=new string[0],text=Clipboard.ContainsText()?Clipboard.GetText():""}));}catch(ExternalException){Console.Error.Write("CLIPBOARD_BUSY");return 2;}return 0;
   }
   Application.EnableVisualStyles();
   {
    // The shell dialog is ownerless so it cannot inherit a hidden owner window.
    var dialog=(Dialog)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")));
    try{
     uint flags;dialog.GetOptions(out flags);dialog.SetOptions(flags|0x20|0x40|0x200|0x800|0x1000|0x10000000);
     dialog.SetTitle("图派 · 选择需求文件夹");dialog.SetOkButtonLabel("选择文件夹");
     if(args.Length>0&&Directory.Exists(args[0])){
      object folder;Guid iid=typeof(Item).GUID;Marshal.ThrowExceptionForHR(SHCreateItemFromParsingName(args[0],IntPtr.Zero,ref iid,out folder));
      try{dialog.SetFolder((Item)folder);}finally{Marshal.ReleaseComObject(folder);}
     }
     int hr=ShowInFront(dialog);if(hr==unchecked((int)0x800704C7))return 0;Marshal.ThrowExceptionForHR(hr);
     ItemArray items;dialog.GetResults(out items);var paths=new List<string>();
     try{uint count;items.GetCount(out count);for(uint i=0;i<count;i++){Item selected;items.GetItemAt(i,out selected);try{IntPtr text;selected.GetDisplayName(0x80058000,out text);try{paths.Add(Marshal.PtrToStringUni(text));}finally{Marshal.FreeCoTaskMem(text);}}finally{Marshal.ReleaseComObject(selected);}}}finally{Marshal.ReleaseComObject(items);}
     Console.Write(Json(paths));
    }finally{Marshal.ReleaseComObject(dialog);}
   }return 0;
  }catch(Exception){Console.Error.Write("NATIVE_OPERATION_FAILED");return 1;}
 }
}
// Interactive selector is built as winexe; background clipboard operations remain hidden.
