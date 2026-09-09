"use client";

// YOMICO Delivery Company registration (Phase 2).
//
// A public, self-service application for a delivery company. The authorised
// person creates their OWN Firebase Auth account (primary client auth — the
// SAME pattern as vendor-register / freelancer registration; exactly ONE account
// is created and it becomes the prospective owner identity), uploads the bank
// cancelled cheque to delivery-kyc/{uid}/..., and submits ONE
// deliveryCompanyApplications/{uid} document with status "Pending" — then is
// signed out to await YOMICO Admin review.
//
// Approval is a SEPARATE admin server action that creates the operational
// deliveryCompanies record (status Active) and ties ownerUid to this uid. No
// second Auth account is ever created. Nothing here sets a company/provider role.
//
// SECURITY: the cancelled cheque is stored as a Storage OBJECT PATH (via
// deliveryKycPath), never a permanent getDownloadURL token. The password is used
// only to create the account and is never stored, logged, or sent to any API.
//
// This revision is PRESENTATION ONLY (light-blue/white visual system matching
// /delivery-register) — the application/KYC/submit logic, company fields and
// data requirements are unchanged.
import Link from "next/link";
import { useMemo, useState, type ChangeEvent } from "react";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { ref, uploadBytesResumable } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { sendVerificationEmail } from "@/lib/sendVerificationEmail";
import { deliveryKycPath } from "@/lib/storagePaths";

const STATES = ["Gujarat", "Maharashtra", "Rajasthan", "Delhi", "Karnataka", "Other"];
const BUSINESS_TYPES = ["Private Limited", "LLP", "Partnership", "Sole Proprietorship", "Other"];
const MAX_DOC_BYTES = 10 * 1024 * 1024;

type FormDataType = {
  companyName: string;
  legalName: string;
  businessType: string;
  gstNumber: string;
  contactEmail: string;
  contactPhone: string;
  line: string;
  city: string;
  state: string;
  pincode: string;
  serviceAreas: string; // comma-separated in the UI; parsed to string[] on submit
  bankAccountHolder: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  apName: string;
  apDesignation: string;
  apPhone: string;
  apEmail: string; // becomes the login / owner identity
  password: string;
  agreed: boolean;
};

const EMPTY: FormDataType = {
  companyName: "", legalName: "", businessType: "Private Limited", gstNumber: "",
  contactEmail: "", contactPhone: "",
  line: "", city: "", state: "", pincode: "",
  serviceAreas: "",
  bankAccountHolder: "", bankName: "", accountNumber: "", ifsc: "",
  apName: "", apDesignation: "", apPhone: "", apEmail: "", password: "",
  agreed: false,
};

function isAllowedDoc(file: File): boolean {
  return file.type.startsWith("image/") || file.type === "application/pdf";
}
function parseAreas(raw: string): string[] {
  return raw.split(",").map((a) => a.trim()).filter(Boolean).slice(0, 50);
}

export default function DeliveryCompanyRegisterPage() {
  const [formData, setFormData] = useState<FormDataType>(EMPTY);
  const [chequeFile, setChequeFile] = useState<File | null>(null);
  const [chequeProgress, setChequeProgress] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = type === "checkbox" && (e.target as HTMLInputElement).checked;
    setFormData((p) => ({ ...p, [name]: type === "checkbox" ? checked : value }));
  };

  const areas = useMemo(() => parseAreas(formData.serviceAreas), [formData.serviceAreas]);

  const progress = useMemo(() => {
    let done = 0;
    if (formData.companyName && formData.legalName && formData.businessType) done++;
    if (formData.contactEmail && formData.contactPhone && formData.line && formData.city && formData.state && formData.pincode) done++;
    if (areas.length > 0) done++;
    if (formData.bankAccountHolder && formData.bankName && formData.accountNumber && formData.ifsc) done++;
    if (formData.apName && formData.apDesignation && formData.apPhone && formData.apEmail && formData.password) done++;
    if (chequeFile) done++;
    if (formData.agreed) done++;
    return Math.round((done / 7) * 100);
  }, [formData, areas, chequeFile]);

  const validate = (): string | null => {
    const f = formData;
    if (!f.companyName || !f.legalName || !f.businessType) return "Complete your company details.";
    if (!/^\S+@\S+\.\S+$/.test(f.contactEmail)) return "Enter a valid business contact email.";
    if (!/^\d{10}$/.test(f.contactPhone)) return "Enter a valid 10 digit business phone.";
    if (!f.line || !f.city || !f.state || !f.pincode) return "Complete your business address.";
    if (!/^\d{6}$/.test(f.pincode)) return "Enter a valid 6 digit PIN code.";
    if (areas.length === 0) return "Enter at least one service area.";
    if (!f.bankAccountHolder || !f.bankName || !f.accountNumber || !f.ifsc) return "Complete your bank details.";
    if (!/^\d{9,18}$/.test(f.accountNumber)) return "Enter a valid bank account number.";
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifsc)) return "Enter a valid IFSC code.";
    if (!f.apName || !f.apDesignation || !f.apPhone || !f.apEmail) return "Complete the authorised person details.";
    if (!/^\d{10}$/.test(f.apPhone)) return "Enter a valid 10 digit authorised-person phone.";
    if (!/^\S+@\S+\.\S+$/.test(f.apEmail)) return "Enter a valid authorised-person email.";
    if (f.password.length < 6) return "Password must be at least 6 characters.";
    if (!chequeFile) return "Upload your bank cancelled cheque / bank proof.";
    if (!isAllowedDoc(chequeFile)) return "The document must be an image or PDF.";
    if (chequeFile.size >= MAX_DOC_BYTES) return "The document must be under 10 MB.";
    if (!f.agreed) return "Please accept the declaration to submit.";
    return null;
  };

  const uploadCheque = (uid: string, file: File): Promise<string> => {
    const path = deliveryKycPath(uid, "cheque", file);
    const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type });
    return new Promise<string>((resolve, reject) => {
      task.on(
        "state_changed",
        (snap) => setChequeProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        (err) => reject(err),
        () => resolve(path), // store the PATH, never a URL
      );
    });
  };

  const submit = async () => {
    if (loading) return;
    const problem = validate();
    if (problem) { setError(problem); return; }
    setError(null);
    setLoading(true);
    try {
      // ONE Auth account (the authorised person / prospective owner). Its email
      // is the login identity; its uid becomes ownerUid on approval.
      const cred = await createUserWithEmailAndPassword(auth, formData.apEmail.trim().toLowerCase(), formData.password);
      const uid = cred.user.uid;

      sendVerificationEmail(cred.user).catch((e) => console.error("Verification email failed:", e));

      const chequeDocPath = await uploadCheque(uid, chequeFile!);

      await setDoc(doc(db, "deliveryCompanyApplications", uid), {
        uid,
        companyName: formData.companyName.trim(),
        legalName: formData.legalName.trim(),
        businessType: formData.businessType,
        gstNumber: formData.gstNumber.trim().toUpperCase(),
        contactEmail: formData.contactEmail.trim().toLowerCase(),
        contactPhone: formData.contactPhone.trim(),
        businessAddress: {
          line: formData.line.trim(),
          city: formData.city.trim(),
          state: formData.state,
          pincode: formData.pincode.trim(),
        },
        serviceAreas: areas,
        bankAccountHolder: formData.bankAccountHolder.trim(),
        bankName: formData.bankName.trim(),
        accountNumber: formData.accountNumber.trim(),
        ifsc: formData.ifsc.trim().toUpperCase(),
        chequeDocPath, // Storage object path only — never a public URL
        authorisedPerson: {
          name: formData.apName.trim(),
          designation: formData.apDesignation.trim(),
          phone: formData.apPhone.trim(),
          email: formData.apEmail.trim().toLowerCase(),
        },
        status: "Pending",
        createdAt: serverTimestamp(),
      });

      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (idToken) {
          await fetch("/api/delivery/company-applications/registered", {
            method: "POST",
            headers: { Authorization: `Bearer ${idToken}` },
          });
        }
      } catch (e) {
        console.error("Admin notification failed:", e);
      }

      await signOut(auth);
      setSubmitted(true);
    } catch (err) {
      const code = (err as { code?: string })?.code || "";
      if (code === "auth/email-already-in-use") {
        setError("An account with the authorised-person email already exists. Use a different email, or sign in if you already have a YOMICO account.");
      } else if (code === "auth/invalid-email") {
        setError("Enter a valid authorised-person email.");
      } else if (code === "auth/weak-password") {
        setError("Password is too weak. Use at least 6 characters.");
      } else if (code === "storage/unauthorized" || code === "permission-denied") {
        setError("We couldn't save your application securely. Please try again.");
      } else {
        setError("Could not submit your application. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-50 to-blue-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-blue-100 bg-white p-8 text-center shadow-xl shadow-blue-200/40">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">✓</div>
          <h1 className="text-xl font-bold text-slate-900">Application submitted</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your delivery-company application has been submitted and is awaiting YOMICO Admin approval.
            Once approved, your authorised person can sign in to the Delivery Company Console.
          </p>
          <Link href="/" className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">Back to YOMICO</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-blue-50 text-slate-900">
      {/* Slim professional top bar — no large marketing / dark hero section. */}
      <header className="sticky top-0 z-10 border-b border-blue-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-lg font-extrabold tracking-wide text-slate-900">YOMICO</Link>
          <Link href="/delivery-company/login" className="text-sm font-semibold text-blue-600 hover:underline">
            Company already approved? Sign in →
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        {/* Compact intro (light, not a large coloured block). Teal badge kept as a
            small accent tying to the Delivery Company console identity. */}
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-700">
            YOMICO Delivery Company
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Partner as a delivery company</h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-500">
            Apply to run deliveries for YOMICO with your own team. Submit your company, bank and authorised-person
            details — YOMICO reviews every application before approval.
          </p>
        </div>

        {/* Progress */}
        <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-800">Application progress</span>
            <span className="text-sm font-bold text-blue-600">{progress}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-blue-50">
            <div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <Section number="01" title="Company Information" description="Your registered business identity.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <InputField label="Company name" required name="companyName" value={formData.companyName} onChange={handleChange} placeholder="Trading / brand name" />
            <InputField label="Legal / registered name" required name="legalName" value={formData.legalName} onChange={handleChange} placeholder="As registered" />
            <SelectField label="Business type" required name="businessType" value={formData.businessType} onChange={handleChange} options={BUSINESS_TYPES} />
            <InputField label="GSTIN (if applicable)" name="gstNumber" value={formData.gstNumber} onChange={handleChange} placeholder="GST number" />
          </div>
        </Section>

        <Section number="02" title="Business Contact & Address" description="How YOMICO reaches the company and where it operates.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <InputField label="Contact email" required type="email" name="contactEmail" value={formData.contactEmail} onChange={handleChange} placeholder="ops@company.com" />
            <InputField label="Contact phone" required type="tel" inputMode="numeric" maxLength={10} name="contactPhone" value={formData.contactPhone} onChange={handleChange} placeholder="10 digit phone" />
            <div className="md:col-span-2">
              <InputField label="Address line" required name="line" value={formData.line} onChange={handleChange} placeholder="Registered / operating address" />
            </div>
            <InputField label="City" required name="city" value={formData.city} onChange={handleChange} placeholder="City" />
            <SelectField label="State" required name="state" value={formData.state} onChange={handleChange} options={STATES} placeholder="Select state" />
            <InputField label="PIN code" required name="pincode" inputMode="numeric" maxLength={6} value={formData.pincode} onChange={handleChange} placeholder="6 digit PIN" />
          </div>
        </Section>

        <Section number="03" title="Service Areas" description="Where your company can deliver (comma separated).">
          <InputField label="Service areas" required name="serviceAreas" value={formData.serviceAreas} onChange={handleChange} placeholder="e.g. Ahmedabad, Gandhinagar, Vadodara" />
          {areas.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {areas.map((a) => <span key={a} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700">{a}</span>)}
            </div>
          )}
        </Section>

        <Section number="04" title="Bank Information" description="Company settlement account.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <InputField label="Account holder name" required name="bankAccountHolder" value={formData.bankAccountHolder} onChange={handleChange} placeholder="As per bank" />
            <InputField label="Bank name" required name="bankName" value={formData.bankName} onChange={handleChange} placeholder="Bank name" />
            <InputField label="Account number" required name="accountNumber" inputMode="numeric" value={formData.accountNumber} onChange={handleChange} placeholder="Account number" />
            <InputField label="IFSC code" required name="ifsc" value={formData.ifsc} onChange={handleChange} placeholder="ABCD0123456" />
          </div>
        </Section>

        <Section number="05" title="Authorised Person & Login" description="The person who will manage the company console. Their email + password is the login.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <InputField label="Full name" required name="apName" value={formData.apName} onChange={handleChange} placeholder="Authorised person name" />
            <InputField label="Designation" required name="apDesignation" value={formData.apDesignation} onChange={handleChange} placeholder="e.g. Operations Head" />
            <InputField label="Phone" required type="tel" inputMode="numeric" maxLength={10} name="apPhone" value={formData.apPhone} onChange={handleChange} placeholder="10 digit phone" />
            <InputField label="Email (login)" required type="email" name="apEmail" autoComplete="email" value={formData.apEmail} onChange={handleChange} placeholder="you@company.com" />
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Password <span className="text-red-500">*</span></label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Create a password"
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 pr-16 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-blue-600 hover:text-blue-800">
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">Minimum 6 characters. Used to sign in to the Delivery Company Console once approved.</p>
            </div>
          </div>
        </Section>

        <Section number="06" title="Required Document" description="Upload a clear image or PDF. Stored privately for verification only.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FileUploadCard title="Bank Cancelled Cheque / Bank Proof" required file={chequeFile} progress={chequeProgress} disabled={loading} onChange={(f) => { setChequeFile(f); setChequeProgress(0); }} />
          </div>
          <InfoBox>
            Your bank proof is uploaded to a private, access-controlled location and is visible only to YOMICO for
            verification. It is never shown publicly.
          </InfoBox>
        </Section>

        <Section number="07" title="Declaration & Submit" description="Confirm and submit your application for review.">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <input type="checkbox" name="agreed" checked={formData.agreed} onChange={handleChange} className="mt-1 h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm leading-6 text-slate-700">
              I am authorised to apply on behalf of this company, the information and documents provided are accurate,
              and I agree to YOMICO&apos;s delivery-partner terms. I understand this application will be reviewed before approval.
            </span>
          </label>

          {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className={`mt-5 w-full rounded-xl py-4 text-lg font-semibold text-white shadow-sm transition ${
              loading ? "cursor-not-allowed bg-slate-400" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loading ? "Submitting application…" : "Submit application →"}
          </button>
          <p className="mt-4 text-center text-xs text-slate-500">
            After submitting, you&apos;ll be signed out and notified once YOMICO approves your company.
          </p>
        </Section>
      </section>
    </main>
  );
}

/* ---------------- Reusable presentational components (local, matching /delivery-register) ---------------- */

function Section({ number, title, description, children }: { number: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm md:p-8">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 font-bold text-white shadow-sm">{number}</div>
        <div>
          <h2 className="text-lg font-bold text-slate-900 md:text-xl">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function InputField({
  label, required, name, value, onChange, placeholder, type = "text", inputMode, maxLength, autoComplete,
}: {
  label: string; required?: boolean; name: string; value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void; placeholder?: string; type?: string;
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
  maxLength?: number; autoComplete?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">{label} {required && <span className="text-red-500">*</span>}</label>
      <input
        type={type} name={name} value={value} onChange={onChange} placeholder={placeholder}
        inputMode={inputMode} maxLength={maxLength} autoComplete={autoComplete}
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

function SelectField({
  label, required, name, value, onChange, options, placeholder,
}: {
  label: string; required?: boolean; name: string; value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void; options: string[]; placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">{label} {required && <span className="text-red-500">*</span>}</label>
      <select
        name={name} value={value} onChange={onChange}
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileUploadCard({
  title, required, file, progress, disabled, onChange,
}: {
  title: string; required?: boolean; file: File | null; progress: number; disabled?: boolean;
  onChange: (file: File | null) => void;
}) {
  const tooBig = file ? file.size >= MAX_DOC_BYTES : false;
  const badType = file ? !isAllowedDoc(file) : false;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <p className={`mt-1 text-xs ${required ? "text-red-500" : "text-slate-400"}`}>{required ? "Required" : "Optional"}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white">📄</div>
      </div>

      {!file ? (
        <label className={`flex min-h-28 w-full items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-white ${disabled ? "opacity-50" : "cursor-pointer hover:border-blue-400 hover:bg-blue-50"} transition`}>
          <div className="px-4 text-center">
            <div className="text-2xl">⬆</div>
            <p className="mt-1 text-sm font-semibold text-slate-700">Choose document</p>
            <p className="mt-1 text-xs text-slate-400">JPG, PNG or PDF · max 10 MB</p>
          </div>
          <input type="file" accept="image/*,application/pdf" className="hidden" disabled={disabled} onChange={(e) => onChange(e.target.files?.[0] || null)} />
        </label>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{file.name}</p>
              <p className="text-xs text-slate-400">{(file.type || "unknown").replace("application/", "")} · {fmtSize(file.size)}</p>
            </div>
            {!disabled && (
              <button type="button" onClick={() => onChange(null)} className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Remove</button>
            )}
          </div>
          {(tooBig || badType) && <p className="mt-2 text-xs text-red-600">{tooBig ? "File must be under 10 MB." : "Must be an image or PDF."}</p>}
          {progress > 0 && progress < 100 && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-50">
              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
          {progress === 100 && <p className="mt-2 text-xs text-green-600">Uploaded ✓</p>}
        </div>
      )}
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-5 py-4">
      <div className="flex gap-3">
        <span className="text-blue-600">ℹ</span>
        <p className="text-sm leading-6 text-blue-800">{children}</p>
      </div>
    </div>
  );
}
