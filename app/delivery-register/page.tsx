"use client";

// YOMICO Freelancer / Delivery-Partner registration (Phase 1).
//
// A public, self-service application. The applicant creates their OWN Firebase
// Auth account (primary client auth, same pattern as vendor-register), uploads
// their Aadhaar card + bank cancelled cheque to delivery-kyc/{uid}/..., and
// submits ONE deliveryApplications/{uid} document with status "Pending" — then
// is signed out to await YOMICO Admin review. Approval is a SEPARATE admin step
// that provisions the deliveryPersons record server-side; nothing here grants
// delivery-person access and nothing here sets providerType/companyId.
//
// SECURITY: Aadhaar is collected as a DOCUMENT ONLY — no Aadhaar number field.
// Sensitive documents are stored as Storage OBJECT PATHS (via deliveryKycPath),
// never as permanent getDownloadURL tokens. The password is used only to create
// the account and is never stored, logged, or sent to any API.
//
// This revision is PRESENTATION ONLY (light-blue/white visual system) — the
// application/KYC/submit logic and data requirements are unchanged.
import Link from "next/link";
import { useMemo, useState, type ChangeEvent } from "react";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { ref, uploadBytesResumable } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { sendVerificationEmail } from "@/lib/sendVerificationEmail";
import { deliveryKycPath } from "@/lib/storagePaths";

const STATES = ["Gujarat", "Maharashtra", "Rajasthan", "Delhi", "Karnataka", "Other"];
const VEHICLE_TYPES = ["Bike", "Scooter", "Bicycle", "Car", "Van", "Other"];
const MAX_DOC_BYTES = 10 * 1024 * 1024;

type FormDataType = {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  line: string;
  city: string;
  state: string;
  pincode: string;
  vehicleType: string;
  vehicleNumber: string;
  bankAccountHolder: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  agreed: boolean;
};

const EMPTY: FormDataType = {
  fullName: "", email: "", password: "", phone: "",
  line: "", city: "", state: "", pincode: "",
  vehicleType: "Bike", vehicleNumber: "",
  bankAccountHolder: "", bankName: "", accountNumber: "", ifsc: "",
  agreed: false,
};

function isAllowedDoc(file: File): boolean {
  return file.type.startsWith("image/") || file.type === "application/pdf";
}

export default function DeliveryRegisterPage() {
  const [formData, setFormData] = useState<FormDataType>(EMPTY);
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null);
  const [chequeFile, setChequeFile] = useState<File | null>(null);
  const [aadhaarProgress, setAadhaarProgress] = useState(0);
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

  const progress = useMemo(() => {
    let done = 0;
    if (formData.fullName && formData.email && formData.password && formData.phone) done++;
    if (formData.line && formData.city && formData.state && formData.pincode) done++;
    if (formData.vehicleType && formData.vehicleNumber) done++;
    if (formData.bankAccountHolder && formData.bankName && formData.accountNumber && formData.ifsc) done++;
    if (aadhaarFile && chequeFile) done++;
    if (formData.agreed) done++;
    return Math.round((done / 6) * 100);
  }, [formData, aadhaarFile, chequeFile]);

  const validate = (): string | null => {
    const f = formData;
    if (!f.fullName || !f.email || !f.password || !f.phone) return "Complete your personal details.";
    if (f.password.length < 6) return "Password must be at least 6 characters.";
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return "Enter a valid email address.";
    if (!/^\d{10}$/.test(f.phone)) return "Enter a valid 10 digit mobile number.";
    if (!f.line || !f.city || !f.state || !f.pincode) return "Complete your address.";
    if (!/^\d{6}$/.test(f.pincode)) return "Enter a valid 6 digit PIN code.";
    if (!f.vehicleType || !f.vehicleNumber) return "Complete your vehicle details.";
    if (!f.bankAccountHolder || !f.bankName || !f.accountNumber || !f.ifsc) return "Complete your bank details.";
    if (!/^\d{9,18}$/.test(f.accountNumber)) return "Enter a valid bank account number.";
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifsc)) return "Enter a valid IFSC code.";
    if (!aadhaarFile) return "Upload your Aadhaar card.";
    if (!chequeFile) return "Upload your bank cancelled cheque.";
    if (!isAllowedDoc(aadhaarFile) || !isAllowedDoc(chequeFile)) return "Documents must be an image or PDF.";
    if (aadhaarFile.size >= MAX_DOC_BYTES || chequeFile.size >= MAX_DOC_BYTES) return "Each document must be under 10 MB.";
    if (!f.agreed) return "Please accept the declaration to submit.";
    return null;
  };

  // Uploads one document to delivery-kyc/{uid}/... and resolves to its Storage
  // OBJECT PATH (never a download URL). Progress is surfaced to the UI.
  const uploadDoc = (uid: string, label: "aadhaar" | "cheque", file: File, onProgress: (pct: number) => void): Promise<string> => {
    const path = deliveryKycPath(uid, label, file);
    const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type });
    return new Promise<string>((resolve, reject) => {
      task.on(
        "state_changed",
        (snap) => onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        (err) => reject(err),
        () => resolve(path), // store the PATH we constructed, not a URL
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
      const cred = await createUserWithEmailAndPassword(auth, formData.email.trim().toLowerCase(), formData.password);
      const uid = cred.user.uid;

      // Branded verification email (best-effort; must not abort registration).
      sendVerificationEmail(cred.user).catch((e) => console.error("Verification email failed:", e));

      // Upload both sensitive documents; keep only their object paths.
      const aadhaarDocPath = await uploadDoc(uid, "aadhaar", aadhaarFile!, setAadhaarProgress);
      const chequeDocPath = await uploadDoc(uid, "cheque", chequeFile!, setChequeProgress);

      // One application per applicant (doc id = uid). status forced Pending; the
      // rules re-validate uid/status and forbid review fields from the client.
      await setDoc(doc(db, "deliveryApplications", uid), {
        uid,
        fullName: formData.fullName.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim().toLowerCase(),
        address: {
          line: formData.line.trim(),
          city: formData.city.trim(),
          state: formData.state,
          pincode: formData.pincode.trim(),
        },
        vehicleType: formData.vehicleType,
        vehicleNumber: formData.vehicleNumber.trim().toUpperCase(),
        bankAccountHolder: formData.bankAccountHolder.trim(),
        bankName: formData.bankName.trim(),
        accountNumber: formData.accountNumber.trim(),
        ifsc: formData.ifsc.trim().toUpperCase(),
        aadhaarDocPath, // Storage object path only — never a public URL
        chequeDocPath,  // Storage object path only — never a public URL
        status: "Pending",
        createdAt: serverTimestamp(),
      });

      // Notify admin (server-side; no sensitive data). Best-effort.
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (idToken) {
          await fetch("/api/delivery/applications/registered", {
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
        setError("An account with this email already exists. Please use a different email, or sign in to the Delivery Person app if you are already registered.");
      } else if (code === "auth/invalid-email") {
        setError("Enter a valid email address.");
      } else if (code === "auth/weak-password") {
        setError("Password is too weak. Use at least 6 characters.");
      } else if (code === "storage/unauthorized" || code === "permission-denied") {
        setError("We couldn't save your application securely. Please try again.");
      } else {
        setError("Could not submit your application. Please try again.");
      }
      // A flaky upload/write can leave the just-created account without an
      // application; re-submitting with the same email will report it exists.
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
            Your application has been submitted and is awaiting YOMICO Admin approval.
            You&apos;ll be able to sign in to the YOMICO Delivery Person app once it is approved.
          </p>
          <Link href="/" className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">
            Back to YOMICO
          </Link>
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
          <Link href="/delivery-app/login" className="text-sm font-semibold text-blue-600 hover:underline">
            Already registered? Sign in →
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        {/* Compact intro (light, not a large coloured block) */}
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
            YOMICO Delivery Partner
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Become a YOMICO delivery partner</h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-500">
            Apply as an independent delivery freelancer. Submit your details and documents — YOMICO reviews every
            application before approval.
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

        {/* 1. Personal */}
        <Section number="01" title="Personal Information" description="How YOMICO will identify and contact you.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <InputField label="Full name" required name="fullName" value={formData.fullName} onChange={handleChange} placeholder="Your full name" />
            <InputField label="Mobile number" required name="phone" type="tel" inputMode="numeric" maxLength={10} value={formData.phone} onChange={handleChange} placeholder="10 digit mobile" />
            <InputField label="Email" required type="email" name="email" autoComplete="email" value={formData.email} onChange={handleChange} placeholder="you@example.com" />
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
              <p className="mt-2 text-xs text-slate-400">Minimum 6 characters. You&apos;ll use this to sign in once approved.</p>
            </div>
          </div>
        </Section>

        {/* 2. Address */}
        <Section number="02" title="Address" description="Your current residential / operating location.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <InputField label="Address line" required name="line" value={formData.line} onChange={handleChange} placeholder="House / street / area" />
            </div>
            <InputField label="City" required name="city" value={formData.city} onChange={handleChange} placeholder="City" />
            <SelectField label="State" required name="state" value={formData.state} onChange={handleChange} options={STATES} placeholder="Select state" />
            <InputField label="PIN code" required name="pincode" inputMode="numeric" maxLength={6} value={formData.pincode} onChange={handleChange} placeholder="6 digit PIN" />
          </div>
        </Section>

        {/* 3. Vehicle */}
        <Section number="03" title="Vehicle Information" description="The vehicle you'll use for deliveries.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <SelectField label="Vehicle type" required name="vehicleType" value={formData.vehicleType} onChange={handleChange} options={VEHICLE_TYPES} />
            <InputField label="Vehicle number" required name="vehicleNumber" value={formData.vehicleNumber} onChange={handleChange} placeholder="e.g. GJ01AB1234" />
          </div>
        </Section>

        {/* 4. Bank */}
        <Section number="04" title="Bank Information" description="Where eligible delivery settlements can be processed.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <InputField label="Account holder name" required name="bankAccountHolder" value={formData.bankAccountHolder} onChange={handleChange} placeholder="Name as per bank" />
            <InputField label="Bank name" required name="bankName" value={formData.bankName} onChange={handleChange} placeholder="Bank name" />
            <InputField label="Account number" required name="accountNumber" inputMode="numeric" value={formData.accountNumber} onChange={handleChange} placeholder="Account number" />
            <InputField label="IFSC code" required name="ifsc" value={formData.ifsc} onChange={handleChange} placeholder="ABCD0123456" />
          </div>
        </Section>

        {/* 5. Documents */}
        <Section number="05" title="Required Documents" description="Upload clear images or PDFs. Stored privately for verification only.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FileUploadCard title="Aadhaar Card" required file={aadhaarFile} progress={aadhaarProgress} disabled={loading} onChange={(f) => { setAadhaarFile(f); setAadhaarProgress(0); }} />
            <FileUploadCard title="Bank Cancelled Cheque" required file={chequeFile} progress={chequeProgress} disabled={loading} onChange={(f) => { setChequeFile(f); setChequeProgress(0); }} />
          </div>
          <InfoBox>
            Your documents are uploaded to a private, access-controlled location and are visible only to YOMICO for
            verification. We do not ask for your Aadhaar number — only the document image/PDF.
          </InfoBox>
        </Section>

        {/* 6. Declaration */}
        <Section number="06" title="Declaration & Submit" description="Confirm and submit your application for review.">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <input type="checkbox" name="agreed" checked={formData.agreed} onChange={handleChange} className="mt-1 h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm leading-6 text-slate-700">
              I confirm the information and documents provided are accurate and mine, and I agree to YOMICO&apos;s
              delivery-partner terms. I understand my application will be reviewed before approval.
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
            After submitting, you&apos;ll be signed out and notified once YOMICO approves your application.
          </p>
        </Section>
      </section>
    </main>
  );
}

/* ---------------- Reusable presentational components ----------------
   (local copies in the vendor-register style; vendor-register is not modified) */

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
              <button type="button" onClick={() => onChange(null)} className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                Remove
              </button>
            )}
          </div>
          {(tooBig || badType) && (
            <p className="mt-2 text-xs text-red-600">{tooBig ? "File must be under 10 MB." : "Must be an image or PDF."}</p>
          )}
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
