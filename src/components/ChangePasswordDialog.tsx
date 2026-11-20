import { useState } from "react";
import { api, errorText } from "../api";
import { useApp } from "../state";
import { Button, ErrorNote, Field, Input, Modal } from "./ui";

export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useApp();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (next !== again) return setError("The two new passwords are not the same");
    setBusy(true);
    try {
      await api("auth.changePassword", { current, next });
      toast("Your password is changed");
      setCurrent("");
      setNext("");
      setAgain("");
      setError("");
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Change my password" width={420} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Change password</Button></>}>
      <div className="space-y-3">
        <Field label="Current password"><Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus /></Field>
        <Field label="New password" hint="At least 4 characters"><Input type="password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <Field label="New password again"><Input type="password" value={again} onChange={(e) => setAgain(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} /></Field>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
