import LegalPageLayout from "@/components/legal/LegalPageLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  // Root layout's title template already appends " | YOMICO".
  title: "Terms of Use",
  description:
    "Read YOMICO's Terms of Use governing your access to and use of the marketplace.",
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

export default function TermsOfUsePage() {
  return (
    <LegalPageLayout title="Terms of Use" lastUpdated="12 August 2026">

      <Section title="1. Acceptance of Terms">
        <p>
          These Terms of Use (&quot;Terms&quot;) govern your access to and use of the
          YOMICO website, mobile site and any related applications
          (together, the &quot;Platform&quot;), operated by YOMICO. By creating an
          account, browsing, or placing an order on the Platform, you agree
          to be bound by these Terms. If you do not agree, please do not use
          the Platform.
        </p>
      </Section>

      <Section title="2. Eligibility">
        <p>
          You must be at least 18 years old, or using the Platform under the
          supervision of a parent or legal guardian, and capable of forming
          a legally binding contract under applicable law, to create an
          account or place an order on YOMICO.
        </p>
      </Section>

      <Section title="3. Account Registration">
        <p>
          You are responsible for maintaining the confidentiality of your
          account credentials and for all activity that occurs under your
          account. You agree to provide accurate, current and complete
          information when registering, and to keep that information
          up to date.
        </p>
      </Section>

      <Section title="4. Orders, Pricing and Payments">
        <p>
          Product listings, prices, offers and availability on YOMICO are
          provided by independent sellers and may change without notice.
          YOMICO facilitates the transaction between buyers and sellers but
          is not itself the seller of record for marketplace listings unless
          explicitly stated. Payment methods, refund and cancellation rules
          for a given order are described at checkout and in our order
          policies.
        </p>
      </Section>

      <Section title="5. User Conduct">
        <p>You agree not to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Use the Platform for any unlawful purpose or in violation of these Terms.</li>
          <li>Post false, misleading, defamatory or infringing content.</li>
          <li>Attempt to gain unauthorized access to any part of the Platform, other accounts, or our systems.</li>
          <li>Interfere with or disrupt the Platform&apos;s operation, including through automated scraping or bots.</li>
        </ul>
      </Section>

      <Section title="6. Intellectual Property">
        <p>
          The YOMICO name, logo, and the design and content of the Platform
          (excluding seller-provided product content) are the property of
          YOMICO or its licensors and may not be used without prior written
          permission.
        </p>
      </Section>

      <Section title="7. Third-Party Links and Sellers">
        <p>
          The Platform may host content from and link to independent
          sellers and third parties. YOMICO does not control and is not
          responsible for the accuracy, quality or legality of third-party
          content, products or services.
        </p>
      </Section>

      <Section title="8. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, YOMICO shall not be
          liable for any indirect, incidental, or consequential damages
          arising from your use of the Platform, including but not limited
          to loss of data, revenue, or profits.
        </p>
      </Section>

      <Section title="9. Termination">
        <p>
          YOMICO may suspend or terminate your account for violation of
          these Terms, suspected fraud, or as required by law, with or
          without prior notice where reasonably necessary.
        </p>
      </Section>

      <Section title="10. Governing Law">
        <p>
          These Terms are governed by the laws of India, and any disputes
          arising from them shall be subject to the exclusive jurisdiction
          of the courts at [City, State — to be confirmed].
        </p>
      </Section>

      <Section title="11. Changes to These Terms">
        <p>
          We may update these Terms from time to time. Material changes
          will be indicated by updating the &quot;Last updated&quot; date above.
          Continued use of the Platform after changes take effect
          constitutes acceptance of the revised Terms.
        </p>
      </Section>

      <Section title="12. Contact Us">
        <p>
          For questions about these Terms, contact us at{" "}
          <span className="font-medium text-gray-800">
            [support email to be added]
          </span>.
        </p>
      </Section>

    </LegalPageLayout>
  );
}
