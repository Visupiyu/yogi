import LegalPageLayout from "@/components/legal/LegalPageLayout";

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

export default function SellerAgreementPage() {
  return (
    <LegalPageLayout title="Seller Agreement" lastUpdated="12 August 2026">

      <Section title="1. Overview">
        <p>
          This Seller Agreement (&quot;Agreement&quot;) governs your participation as
          a seller on the YOMICO marketplace, in addition to our general{" "}
          <a href="/terms" className="text-blue-600 hover:underline">Terms of Use</a>.
          By registering as a seller, you agree to the terms below.
        </p>
      </Section>

      <Section title="2. Eligibility and Verification">
        <p>
          To sell on YOMICO, you must provide accurate business, identity
          (KYC), and bank account information as requested during
          registration. YOMICO reviews and approves seller applications at
          its discretion, and may request additional documentation, reject
          an application, or suspend an approved account if information
          provided is found to be false, incomplete, or non-compliant.
        </p>
      </Section>

      <Section title="3. Product Listings">
        <p>You are responsible for ensuring that every listing you create:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Accurately describes the product, including price, images, specifications and available stock.</li>
          <li>Does not mislead customers about the condition, origin, or authenticity of the product.</li>
          <li>Complies with all applicable Indian laws and regulations for the category the product is listed under.</li>
          <li>Does not infringe any third party&apos;s intellectual property rights.</li>
        </ul>
      </Section>

      <Section title="4. Prohibited Products">
        <p>
          You may not list products that are illegal, counterfeit,
          hazardous, or otherwise prohibited under applicable law or
          YOMICO policy. YOMICO may remove any listing that violates this
          Agreement without prior notice.
        </p>
      </Section>

      <Section title="5. Order Fulfilment">
        <p>
          You agree to keep listed stock quantities accurate, pack and ship
          orders within the timelines shown in your seller dashboard, and
          keep order status updated. Repeated failure to fulfil orders may
          result in account suspension.
        </p>
      </Section>

      <Section title="6. Pricing, Commission and Payouts">
        <p>
          YOMICO charges a commission on completed sales, as shown in your
          seller dashboard and Payout Report. Your net earnings, after
          commission and any applicable deductions, are made available for
          withdrawal to your registered bank account through the Wallet
          section of your seller dashboard, subject to YOMICO&apos;s settlement
          schedule and verification checks.
        </p>
      </Section>

      <Section title="7. Returns, Refunds and Cancellations">
        <p>
          You agree to honour YOMICO&apos;s returns, refunds and cancellation
          policies as applicable to your listed products, and to cooperate
          in resolving customer disputes in good faith.
        </p>
      </Section>

      <Section title="8. Compliance with Law">
        <p>
          You are solely responsible for complying with all laws applicable
          to your business and the products you sell, including but not
          limited to tax (GST), consumer protection, and any
          category-specific licensing requirements. YOMICO may request
          proof of such compliance at any time.
        </p>
      </Section>

      <Section title="9. Suspension and Termination">
        <p>
          YOMICO may suspend or terminate your seller account for breach of
          this Agreement, repeated customer complaints, suspected fraud, or
          as required by law. You may also close your seller account by
          contacting us, subject to settlement of any pending orders and
          payouts.
        </p>
      </Section>

      <Section title="10. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, YOMICO is not liable for
          indirect or consequential losses arising from your use of the
          seller Platform, including lost sales or profits.
        </p>
      </Section>

      <Section title="11. Changes to This Agreement">
        <p>
          We may update this Agreement from time to time. Continued use of
          your seller account after changes take effect constitutes
          acceptance of the revised Agreement.
        </p>
      </Section>

      <Section title="12. Contact Us">
        <p>
          For questions about this Agreement, contact us at{" "}
          <span className="font-medium text-gray-800">
            [seller support email to be added]
          </span>.
        </p>
      </Section>

    </LegalPageLayout>
  );
}
