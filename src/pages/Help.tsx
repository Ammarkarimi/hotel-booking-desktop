// A short guide in plain words, and the keyboard shortcuts.
import { Page, PageHeader, Panel } from "../components/ui";
import { useApp } from "../state";

const TOPICS: Array<{ title: string; steps: string[] }> = [
  { title: "Make a booking", steps: ["Press New booking (or Ctrl+B).", "Choose the arrival and leaving dates, then click a free room. The price for the whole stay is shown on each room.", "Type the phone number of a returning guest to find them, or fill in the new guest's name and mobile.", "Enter any advance paid and press Confirm booking. Then send the confirmation on WhatsApp."] },
  { title: "Walk-in guest", steps: ["Press Walk-in at the top.", "Choose the leaving date and a room, fill in the guest and press Book and check in now."] },
  { title: "Check in", steps: ["On the Dashboard, press Check in next to the guest (or open the booking).", "Tick each adult's ID after looking at the original (Tick ID).", "Press Check in. The welcome message for WhatsApp opens next."] },
  { title: "Take a payment or add food / laundry", steps: ["Open the booking.", "Press Take payment, enter the amount and how it was paid (cash, UPI, card…).", "For food, laundry or an extra bed press Add extra on the bill."] },
  { title: "Check out and the GST invoice", steps: ["Press Check out on the Dashboard or the booking.", "If the guest leaves early or late, choose which nights to bill.", "Take any balance, then press Check out and make invoice. The invoice number is given now.", "Print the invoice or save it as PDF, and send the thank-you on WhatsApp."] },
  { title: "Housekeeping", steps: ["Rooms become Needs cleaning by themselves at check-out.", "Housekeeping staff sign in and press Start cleaning, then Done.", "Rooms with guests arriving today are shown first."] },
  { title: "Shifts and staff", steps: ["Front-desk staff sign in with their own name and start a shift. They read the last handover note.", "At the end: menu at top right → End my shift. Write a handover note and count the cash.", "The owner sees sign-in times, cash and notes in Staff & sign-ins."] },
  { title: "Pathik (Gujarat police register)", steps: ["Switch it on in Settings → Front desk (on by itself for hotels in Gujarat).", "After check-in press Fill in Pathik on the booking (or on the Dashboard list).", "Add any details Pathik still asks for, then press Open Pathik and fill the form. Sign in to Pathik the first time; it is remembered.", "Check the form (green = filled), add the ID number and photo, press Submit in Pathik, then press Entered in Pathik."] },
  { title: "Reports and GST", steps: ["Reports shows occupancy, earnings, average room price and money received for any dates.", "The GST invoices tab is the invoice register for your accountant (GSTR-1 / 3B). Download it for Excel."] },
  { title: "Backups (important)", steps: ["Everything is saved on this computer. A backup is made every day and when you close the software.", "In Settings → Backups choose a folder on a USB drive or in Google Drive / OneDrive.", "If the computer is replaced, install the software and use Restore from file."] },
];

const KEYS = [
  ["Ctrl + B", "New booking"],
  ["Ctrl + K", "Find a booking"],
  ["Esc", "Close a window"],
  ["Ctrl + P", "Print (in a printout window)"],
  ["Ctrl + plus / minus", "Bigger / smaller text"],
];

export function Help() {
  const { info } = useApp();
  return (
    <Page className="max-w-[1100px]">
      <PageHeader title="Help" subtitle={`Innvela Hotel Desk ${info?.version ?? ""} · data folder: ${info?.dataFolder ?? ""}`} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {TOPICS.map((t) => (
          <Panel key={t.title} title={t.title}>
            <ol className="list-decimal space-y-1 pl-5 text-[13px] text-slate-700">
              {t.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </Panel>
        ))}
        <Panel title="Keyboard shortcuts">
          <table className="tbl">
            <tbody>
              {KEYS.map(([k, v]) => (
                <tr key={k}>
                  <td className="font-mono">{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </Page>
  );
}
