// The bridge between the screens and the main process. The screens can only use what is listed here.
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("innvela", {
  call: (method: string, args?: unknown) => ipcRenderer.invoke("api", method, args),
  openPrint: (route: string) => ipcRenderer.invoke("print:open", route),
  print: () => ipcRenderer.invoke("print:print"),
  savePdf: (name: string) => ipcRenderer.invoke("print:pdf", name),
  openExternal: (url: string) => ipcRenderer.invoke("shell:open", url),
  saveFile: (name: string, content: string, kind?: "csv" | "lic" | "txt") => ipcRenderer.invoke("file:save", name, content, kind),
  pickFile: (kind: "backup" | "lic") => ipcRenderer.invoke("file:pick", kind),
  pickFolder: () => ipcRenderer.invoke("folder:pick"),
  saveBackupAs: () => ipcRenderer.invoke("backup:saveAs"),
  showFolder: (path: string) => ipcRenderer.invoke("folder:show", path),
  readTextFile: (path: string) => ipcRenderer.invoke("file:readText", path),
  onPathikStatus: (fn: (s: { bookingId: string; state: string; message?: string }) => void) => {
    const listener = (_e: unknown, s: { bookingId: string; state: string; message?: string }) => fn(s);
    ipcRenderer.on("pathik:status", listener);
    return () => ipcRenderer.removeListener("pathik:status", listener);
  },
  platform: process.platform,
});
