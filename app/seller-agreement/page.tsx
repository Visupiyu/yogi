import Link from "next/link";

export const metadata = {
  title: "Seller Agreement | YOMICO",
  description:
    "Read the YOMICO Seller Agreement, including seller responsibilities, payouts, product compliance, and marketplace policies.",
};
export default function SellerAgreementPage() {

  return (

    <div className="min-h-screen bg-gray-50">

      <div className="max-w-5xl mx-auto px-4 py-12">

        <h1 className="text-5xl font-bold text-center mb-8">
          Seller Agreement
        </h1>

        <p className="text-center text-gray-500 mb-8">
          Last Updated: July 2026
        </p>

        <p className="text-center text-gray-600 max-w-3xl mx-auto mb-10">
  This Seller Agreement outlines the rights, responsibilities, and
  obligations of sellers using the YOMICO marketplace.
</p>

        <div className="bg-white p-8 rounded-2xl shadow space-y-6">

         <p>

Welcome to YOMICO. This Seller Agreement governs the relationship between YOMICO and every seller who lists or sells products on the marketplace.

</p>

<div>

<h2 className="text-2xl font-bold mb-2">

1. Seller Eligibility

</h2>

<p>

To become a seller, you must provide accurate business information, complete KYC verification if required, and comply with all applicable Indian laws.

</p>

</div>

<div>

<h2 className="text-2xl font-bold mb-2">

2. Seller Responsibilities

</h2>

<p>

Sellers are responsible for maintaining accurate product listings, pricing, stock availability, product quality, packaging, shipping, and customer support.

</p>

</div>

<div>

<h2 className="text-2xl font-bold mb-2">

3. Product Compliance

</h2>

<p>

All products listed on YOMICO must be genuine, legally permitted for sale, and comply with applicable consumer protection, GST, and product safety regulations.

</p>

</div>

<div>

<h2 className="text-2xl font-bold mb-2">

4. Orders & Fulfilment

</h2>

<p>

Sellers must process confirmed orders promptly, dispatch products within the promised time, and maintain accurate inventory.

</p>

</div>

<div>

<h2 className="text-2xl font-bold mb-2">

5. Payments & Payouts

</h2>

<p>

Seller payouts will be processed according to YOMICO's payout schedule after applicable marketplace fees, taxes, refunds, or other adjustments.

</p>

</div>

<div>

  <div>

  <h2 className="text-2xl font-bold mb-2">
    6. Marketplace Fees
  </h2>

  <p>
    Sellers agree to pay applicable marketplace commissions, payment
    processing charges, taxes, and any other fees communicated by
    YOMICO. Fee structures may be updated from time to time with
    appropriate notice.
  </p>

</div>

<h2 className="text-2xl font-bold mb-2">

7. Returns & Refunds

</h2>

<p>

Sellers agree to follow the YOMICO Return & Refund Policy and cooperate in resolving customer issues fairly and promptly.

</p>

</div>

<div>

<h2 className="text-2xl font-bold mb-2">

8. Suspension or Termination

</h2>

<p>

YOMICO may suspend or terminate seller accounts for fraud, counterfeit products, repeated policy violations, abusive conduct, or any activity that harms customers or the marketplace.

</p>

</div>

<div>

<h2 className="text-2xl font-bold mb-2">

9. Limitation of Liability

</h2>

<p>

YOMICO provides the marketplace platform but does not manufacture or own products sold by independent sellers. Sellers remain responsible for their products and legal obligations.

</p>

</div>

<div>

<h2 className="text-2xl font-bold mb-2">

10. Governing Law

</h2>

<p>

This Seller Agreement shall be governed by the laws of India, and disputes shall be subject to the jurisdiction of the competent courts in India.

</p>

</div>

<div>

<h2 className="text-2xl font-bold mb-2">

11. Seller Support

</h2>

<p>

For questions regarding this Seller Agreement, please contact the YOMICO Seller Support Team through the Contact Us page.

</p>

</div>
<div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">

  <h3 className="text-2xl font-bold mb-2">
    Need Help as a Seller?
  </h3>

  <p className="text-gray-600 mb-4">
    If you have questions about your seller account, payouts, or marketplace policies, our support team is here to help.
  </p>

  <Link
    href="/contact"
    className="inline-block bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition"
  >
    Contact Seller Support
  </Link>

</div>

        </div>

      </div>

    </div>

  );

}