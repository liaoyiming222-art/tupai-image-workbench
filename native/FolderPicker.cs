using System;
using System.IO;
using System.Text;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Windows.Forms;
internal static class FolderPicker {
 [DllImport("shell32.dll",CharSet=CharSet.Unicode)] static extern int SHCreateItemFromParsingName(string p,IntPtr b,ref Guid iid,[MarshalAs(UnmanagedType.Interface)] out object item);
 [DllImport("shell32.dll",CharSet=CharSet.Unicode)] static extern IntPtr ShellExecute(IntPtr h,string verb,string file,string args,string dir,int show);
 [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);
 [StructLayout(LayoutKind.Sequential)] struct Size {public int X,Y;}
 [ComImport,Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface ImageFactory { void GetImage(Size size,uint flags,out IntPtr bitmap); }
 [ComImport,Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface Item {void BindToHandler(IntPtr a,ref Guid b,ref Guid c,out IntPtr d);void GetParent(out Item p);void GetDisplayName(uint kind,out IntPtr name);}
 [ComImport,Guid("42f85136-db7e-439c-85f1-e4075d135fc8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface Dialog {
  [PreserveSig] int Show(IntPtr owner);
  void SetFileTypes(uint n,IntPtr types);void SetFileTypeIndex(uint n);void GetFileTypeIndex(out uint n);
  void Advise(IntPtr a,out uint b);void Unadvise(uint a);
  void SetOptions(uint flags);void GetOptions(out uint flags);
  void SetDefaultFolder(Item item);void SetFolder(Item item);void GetFolder(out Item item);void GetCurrentSelection(out Item item);
  void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);void GetFileName(out IntPtr name);
  void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
  void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
  void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
  void GetResult(out Item item);
 }
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
  Console.OutputEncoding=new UTF8Encoding(false);
  if(args.Length>0&&args[0]=="--self-test"){Console.Write("NATIVE_FOLDER_PICKER_READY");return 0;}
  try{
   if(args.Length==3&&args[0]=="--thumbnail"){Thumbnail(args[1],args[2]);return 0;}
   if(args.Length==2&&args[0]=="--open-folder"){
    if(!Directory.Exists(args[1]))throw new IOException();
    long result=ShellExecute(IntPtr.Zero,"open",Path.GetFullPath(args[1]),null,null,1).ToInt64();
    if(result<=32)throw new IOException();return 0;
   }
   Application.EnableVisualStyles();
   using(var owner=new Form()){
    owner.ShowInTaskbar=false;owner.TopMost=true;owner.Opacity=0;owner.Width=1;owner.Height=1;owner.StartPosition=FormStartPosition.CenterScreen;owner.Show();owner.Activate();
    var dialog=(Dialog)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")));
    try{
     uint flags;dialog.GetOptions(out flags);dialog.SetOptions(flags|0x20|0x40|0x800|0x1000|0x10000000);
     dialog.SetTitle("选择需求文件夹");dialog.SetOkButtonLabel("选择文件夹");
     if(args.Length>0&&Directory.Exists(args[0])){
      object folder;Guid iid=typeof(Item).GUID;Marshal.ThrowExceptionForHR(SHCreateItemFromParsingName(args[0],IntPtr.Zero,ref iid,out folder));
      try{dialog.SetFolder((Item)folder);}finally{Marshal.ReleaseComObject(folder);}
     }
     int hr=dialog.Show(owner.Handle);if(hr==unchecked((int)0x800704C7))return 0;Marshal.ThrowExceptionForHR(hr);
     Item selected;dialog.GetResult(out selected);
     try{IntPtr text;selected.GetDisplayName(0x80058000,out text);try{Console.Write(Marshal.PtrToStringUni(text));}finally{Marshal.FreeCoTaskMem(text);}}finally{Marshal.ReleaseComObject(selected);}
    }finally{Marshal.ReleaseComObject(dialog);}
   }return 0;
  }catch(Exception){Console.Error.Write("NATIVE_OPERATION_FAILED");return 1;}
 }
}
