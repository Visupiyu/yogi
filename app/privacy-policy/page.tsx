import LegalPageLayout from "@/components/legal/LegalPageLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  // Root layout's title template already appends " | YOMICO".
  title: "Privacy Policy",
  description:
    "Read YOMICO's Privacy Policy — how we collect, use and protect your personal information.",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xl font-bold text-gray-900 mb-3">{title}</h2>
      <div className="text-gray-600 leading-relaxed space-y-3">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="12 August 2026">

      <Section title="1. Introduction">
        <p>
          This Privacy Policy explains how YOMICO collects, uses, shares
          and protects personal information when you use our Platform as a
          customer, seller, or visitor. By using YOMICO, you agree to the
          practices described here.
        </p>
      </Section>

      <Section title="2. Information We Collect">
        <p>Depending on how you use YOMICO, we may collect:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            <span className="font-medium text-gray-800">Account information</span> —
            name, email address, phone number, and password.
          </li>
          <li>
            <span className="font-medium text-gray-800">Order information</span> —
            shipping address, order history, and payment status (payment
            card/UPI details are handled by our payment processors and are
            not stored by YOMICO).
          </li>
          <li>
            <span className="font-medium text-gray-800">Seller information</span> —
            business name, GST and PAN details, bank account and IFSC
            details, KYC documents (such as Aadhaar and cancelled cheque),
            and pickup/business address.
          </li>
          <li>
            <span className="font-medium text-gray-800">Usage information</span> —
            pages visited, products viewed, device and browser information,
            and approximate location inferred from IP address.
          </li>
        </ul>
      </Section>

      <Section title="3. How We Use Your Information">
        <p>We use the information we collect to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Create and manage your account, and process orders and payments.</li>
          <li>Verify seller identity and business details (KYC) before approving a seller account.</li>
          <li>Communicate with you about orders, account activity, and support requests.</li>
          <li>Improve and personalize the Platform, and detect fraud or abuse.</li>
          <li>Comply with applicable legal and regulatory obligations.</li>
        </ul>
      </Section>

      <Section title="4. Cookies">
        <p>
          We use cookies and similar technologies to keep you signed in,
          remember your preferences, and understand how the Platform is
          used. You can control cookies through your browser settings,
          though some features may not work correctly if cookies are
          disabled.
        </p>
      </Section>

      <Section title="5. Sharing of Information">
        <p>We may share your information with:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Sellers, solely to the extent needed to fulfil an order (e.g. shipping address).</li>
          <li>Payment processors and logistics/delivery partners, to complete transactions and deliveries.</li>
          <li>Law enforcement or regulators, where required by law.</li>
        </ul>
        <p>
          We do not sell your personal information to third parties for
          their own marketing purposes.
        </p>
      </Section>

      <Section title="6. Data Security">
        <p>
          We use reasonable technical and organizational measures to
          protect your information. No method of transmission over the
          internet is completely secure, and we cannot guarantee absolute
          security.
        </p>
      </Section>

      <Section title="7. Data Retention">
        <p>
          We retain personal information for as long as necessary to
          provide our services, comply with legal obligations, resolve
          disputes, and enforce our agreements.
        </p>
      </Section>

      <Section title="8. Your Rights">
        <p>
          You may access, correct, or request deletion of your personal
          information by contacting us using the details below, subject to
          our legal and legitimate business retention needs.
        </p>
      </Section>

      <Section title="9. Grievance Officer">
        <p>
          In accordance with the Information Technology Act, 2000 and
          rules made thereunder, the contact details of our Grievance
          Officer are:
        </p>
        <p className="text-gray-800 font-medium">
          [Grievance Officer name to be added]
          <br />
          YOMICO
          <br />
          Email: [grievance email to be added]
        </p>
      </Section>

      <Section title="10. Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. Material
          changes will be reflected by updating the &quot;Last updated&quot; date
          above.
        </p>
      </Section>

      <Section title="11. Contact Us">
        <p>
          For privacy-related questions, contact us at{" "}
          <span className="font-medium text-gray-800">
            [support email to be added]
          </span>.
        </p>
      </Section>

    </LegalPageLayout>
  );
}
