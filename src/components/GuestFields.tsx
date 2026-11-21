// The guest's details, used in a new booking and on the guest's page.
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Field, Input, Select, Textarea, Toggle } from "./ui";
import { ID_TYPES, INDIAN_STATES, label } from "../../shared/format";
import type { Guest } from "../../shared/types";

export type GuestDraft = Partial<Guest>;

export function GuestFields({ value, onChange, full }: { value: GuestDraft; onChange: (g: GuestDraft) => void; full?: boolean }) {
  const [more, setMore] = useState(!!full || !!value.company || !!value.gstin);
  const set = <K extends keyof Guest>(k: K, v: Guest[K]) => onChange({ ...value, [k]: v });
  const foreign = (value.nationality ?? "Indian").toLowerCase() !== "indian";
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="First name" required>
        <Input value={value.firstName ?? ""} onChange={(e) => set("firstName", e.target.value)} />
      </Field>
      <Field label="Last name">
        <Input value={value.lastName ?? ""} onChange={(e) => set("lastName", e.target.value)} />
      </Field>
      <Field label="Mobile (WhatsApp)" required>
        <Input value={value.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="98765 43210" />
      </Field>
      <Field label="Email">
        <Input value={value.email ?? ""} onChange={(e) => set("email", e.target.value)} />
      </Field>
      <Field label="City">
        <Input value={value.city ?? ""} onChange={(e) => set("city", e.target.value)} />
      </Field>
      <Field label="State">
        <Select value={value.state ?? ""} onChange={(e) => set("state", e.target.value)} options={[{ value: "", label: "—" }, ...Object.values(INDIAN_STATES).sort().map((s) => ({ value: s, label: s })), { value: "Outside India", label: "Outside India" }]} />
      </Field>
      <Field label="ID usually shown">
        <Select value={value.idType ?? ""} onChange={(e) => set("idType", e.target.value)} options={[{ value: "", label: "—" }, ...ID_TYPES.map((t) => ({ value: t, label: label(t) }))]} />
      </Field>
      <Field label="Nationality">
        <Input value={value.nationality ?? "Indian"} onChange={(e) => set("nationality", e.target.value)} />
      </Field>
      {foreign && (
        <>
          <Field label="Passport number" hint="For Form C (foreign guests)">
            <Input value={value.passportNo ?? ""} onChange={(e) => set("passportNo", e.target.value)} />
          </Field>
          <Field label="Visa number">
            <Input value={value.visaNo ?? ""} onChange={(e) => set("visaNo", e.target.value)} />
          </Field>
        </>
      )}
      <button type="button" onClick={() => setMore(!more)} className="col-span-2 flex items-center gap-1 text-left text-[12.5px] font-medium text-brand-700">
        {more ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />} Address, company & GST details
      </button>
      {more && (
        <>
          <Field label="Address" className="col-span-2">
            <Input value={value.address ?? ""} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="Locality / area">
            <Input value={value.locality ?? ""} onChange={(e) => set("locality", e.target.value)} />
          </Field>
          <Field label="District">
            <Input value={value.district ?? ""} onChange={(e) => set("district", e.target.value)} />
          </Field>
          <Field label="PIN code">
            <Input value={value.pinCode ?? ""} onChange={(e) => set("pinCode", e.target.value)} maxLength={10} />
          </Field>
          <Field label="Date of birth">
            <Input type="date" value={value.dateOfBirth ?? ""} onChange={(e) => set("dateOfBirth", e.target.value)} />
          </Field>
          <Field label="Company (bill in company name)">
            <Input value={value.company ?? ""} onChange={(e) => set("company", e.target.value)} />
          </Field>
          <Field label="Company GSTIN" hint="For a B2B GST invoice">
            <Input value={value.gstin ?? ""} onChange={(e) => set("gstin", e.target.value.toUpperCase())} maxLength={15} />
          </Field>
          {full && (
            <>
              <Field label="Notes" className="col-span-2">
                <Textarea value={value.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Likes a quiet room, allergic to peanuts…" />
              </Field>
              <div className="col-span-2 flex gap-8">
                <Toggle checked={!!value.vip} onChange={(v) => set("vip", v)} label="VIP guest" />
                <Toggle checked={!!value.blacklisted} onChange={(v) => set("blacklisted", v)} label="Do not allow" hint="Warns before this guest is booked again" />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
