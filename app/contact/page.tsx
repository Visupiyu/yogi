"use client";

import { useRef, useState } from "react";
import { Mail, Phone, MapPin } from "lucide-react";
import { auth } from "@/lib/firebase";
import { CONTACT_LIMITS, validateContact, type ContactErrors } from "@/lib/contactForm";

const INPUT = "w-full border p-3 rounded-xl";
const ERROR_TEXT = "mt-1 text-sm text-red-600";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "", website: "" });
  const [fieldErrors, setFieldErrors] = useState<ContactErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<null | { ticket: boolean }>(null);
  // Synchronous in-flight guard: state alone lets two quick clicks both through.
  const sendingRef = useRef(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sendingRef.current) return;
    setFormError(null);
    // UX only — /api/contact validates again and is the authority.
    const check = validateContact(form);
    setFieldErrors(check.errors);
    if (!check.ok) {
      const first = (["name", "email", "subject", "message"] as const).find((k) => check.errors[k]);
      if (first) document.getElementById(`contact-${first}`)?.focus();
      return;
    }
    sendingRef.current = true;
    setSending(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      // A signed-in customer is identified by their token (server-side), never by
      // what is typed here. Signed out is fine.
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch("/api/contact", { method: "POST", headers, body: JSON.stringify(form) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success === true) {
        setSent({ ticket: data.ticket === true });
        setForm({ name: "", email: "", subject: "", message: "", website: "" });
        return;
      }
      if (res.status === 400 && data?.fields) setFieldErrors(data.fields as ContactErrors);
      setFormError(
        res.status === 429
          ? "You've sent several messages recently. Please wait a few minutes and try again."
          : res.status === 400
          ? "Please check the highlighted fields and try again."
          : "We couldn't send your message right now. Your message is still here — please try again, or email us at yomico.help@gmail.com."
      );
    } catch {
      setFormError("We couldn't reach YOMICO. Check your connection — your message is still here, so you can try again.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (

    <div className="min-h-screen bg-gray-50">

      <div className="max-w-6xl mx-auto px-4 py-12">

        <h1 className="text-4xl font-bold text-center mb-4">
          Contact Us
        </h1>
        <p className="text-center text-gray-500 max-w-2xl mx-auto">
  Whether you have questions about your order, need seller assistance,
  or want to partner with YOMICO, our team is ready to help.
</p>

        <p className="text-center text-gray-600 mb-10">
          We'd love to hear from you. Get in touch with the YOMICO team.
        </p>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

  {/* Left Column */}

  <div className="space-y-8">

          {/* Contact Info */}

          <div className="bg-white p-8 rounded-2xl shadow">

            <h2 className="text-2xl font-bold mb-6">
              Contact Information
            </h2>

            <div className="space-y-6">

              <div className="flex items-center gap-4">

                <Phone className="text-green-600" />

                <a
  href="tel:+916358761569"
  className="hover:text-green-600"
>
  +91 6358761569
</a>

              </div>

              <div className="flex items-center gap-4">

                <Mail className="text-blue-600" />

                <span>
                 <a
  href="mailto:yomico.help@gmail.com"
  className="text-blue-600 hover:underline"
>
  yomico.help@gmail.com
</a>
<p className="text-sm text-gray-500 ml-10">
  We typically reply within 24–48 business hours.
</p>
                </span>

              </div>
              
              <div className="flex items-center gap-4">

                <MapPin className="text-red-600" />

                <span>
                  VADODARA, Gujarat, India
                </span>

              </div>

            </div>

          </div>

          <div className="mt-8 bg-green-50 border border-green-200 rounded-xl p-5">

  <h3 className="font-bold text-lg mb-2">

    Customer Support

  </h3>

  <p className="text-gray-700">

    Our support team aims to respond to all inquiries within
    24–48 business hours.

  </p>

</div>
          <div className="bg-white p-6 rounded-2xl shadow">

  <div className="flex items-start gap-4">

  <span className="text-2xl">
    🕒
  </span>

  <div>

    <p className="font-semibold">
      Business Hours
    </p>


    <p>
      Monday - Saturday
    </p>

    <p>
      9:00 AM - 6:00 PM (IST)
    </p>
    <div className="pt-4 border-t">

  <h3 className="font-semibold mb-3">
    Follow Us
  </h3>

  <div className="flex flex-wrap gap-x-4 gap-y-2">

    <a href="#" className="text-blue-600 hover:underline">
  Facebook
</a>

<a href="#" className="text-pink-600 hover:underline">
  Instagram
</a>

<a href="#" className="text-blue-700 hover:underline">
  LinkedIn
</a>

  </div>

</div>

  </div>

</div>
</div>
</div>

          {/* Contact Form */}

          <div className="bg-white p-8 rounded-2xl shadow">

            <h2 className="text-2xl font-bold mb-6">
              Submit Request
            </h2>

            {sent ? (
              <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-5">
                <p className="font-semibold text-green-800">Thank you — we&apos;ve received your message.</p>
                <p className="mt-2 text-sm text-gray-700">
                  Our team will read it and reply to the email address you gave us. We typically reply within
                  24–48 business hours (Monday–Saturday).
                  {sent.ticket && " You can also follow it under Profile › Tickets."}
                </p>
                <button
                  type="button"
                  onClick={() => setSent(null)}
                  className="mt-4 text-sm font-semibold text-green-700 underline"
                >
                  Send another message
                </button>
              </div>
            ) : (
            <form onSubmit={submit} noValidate className="space-y-4" aria-busy={sending}>

              {formError && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              {/* Honeypot — real visitors never see or reach it. */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", height: 0, overflow: "hidden" }}>
                <label htmlFor="contact-website">Website</label>
                <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off"
                  value={form.website} onChange={set("website")} />
              </div>

              <div>
                <label htmlFor="contact-name" className="block mb-1 text-sm font-medium">Your name</label>
                <input id="contact-name" name="name" type="text" autoComplete="name" required
                  maxLength={CONTACT_LIMITS.name} value={form.name} onChange={set("name")}
                  aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? "contact-name-err" : undefined}
                  className={INPUT} />
                {fieldErrors.name && <p id="contact-name-err" className={ERROR_TEXT}>{fieldErrors.name}</p>}
              </div>

              <div>
                <label htmlFor="contact-email" className="block mb-1 text-sm font-medium">Your email</label>
                <input id="contact-email" name="email" type="email" autoComplete="email" required
                  maxLength={CONTACT_LIMITS.email} value={form.email} onChange={set("email")}
                  aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? "contact-email-err" : undefined}
                  className={INPUT} />
                {fieldErrors.email && <p id="contact-email-err" className={ERROR_TEXT}>{fieldErrors.email}</p>}
              </div>

              <div>
                <label htmlFor="contact-subject" className="block mb-1 text-sm font-medium">Subject</label>
                <input id="contact-subject" name="subject" type="text" required
                  maxLength={CONTACT_LIMITS.subject} value={form.subject} onChange={set("subject")}
                  aria-invalid={!!fieldErrors.subject} aria-describedby={fieldErrors.subject ? "contact-subject-err" : undefined}
                  className={INPUT} />
                {fieldErrors.subject && <p id="contact-subject-err" className={ERROR_TEXT}>{fieldErrors.subject}</p>}
              </div>

              <div>
                <label htmlFor="contact-message" className="block mb-1 text-sm font-medium">Your message</label>
                <textarea id="contact-message" name="message" rows={5} required
                  maxLength={CONTACT_LIMITS.message} value={form.message} onChange={set("message")}
                  aria-invalid={!!fieldErrors.message} aria-describedby={fieldErrors.message ? "contact-message-err" : undefined}
                  className={INPUT} />
                {fieldErrors.message && <p id="contact-message-err" className={ERROR_TEXT}>{fieldErrors.message}</p>}
              </div>

              <p className="text-sm text-gray-500">

By submitting this form, you agree to our Privacy Policy and Terms & Conditions. We will only use your information to respond to your inquiry.

</p>

              <button
                type="submit"
                disabled={sending}
                className="
                  w-full
                  bg-green-600
                  hover:bg-green-700
                  disabled:opacity-60
                  disabled:cursor-not-allowed
                  text-white
                  py-3
                  rounded-xl
                  font-semibold
                "
              >
                {sending ? "Sending…" : formError ? "Retry sending" : "Send message"}
              </button>

            </form>
            )}
            <div className="mt-12 text-center">

  <h2 className="text-2xl font-bold mb-6">

    Helpful Links

  </h2>

  <div className="flex flex-wrap justify-center gap-4">

    <a href="/privacy-policy" className="text-green-600 hover:underline">
      Privacy Policy
    </a>

    <a href="/terms" className="text-green-600 hover:underline">
      Terms & Conditions
    </a>

    <a href="/shipping-policy" className="text-green-600 hover:underline">
      Shipping Policy
    </a>

    <a href="/return-refund" className="text-green-600 hover:underline">
      Return & Refund Policy
    </a>

  </div>

  </div>
  
</div>

        </div>

      </div>

    </div>

  );

}