import Link from "next/link";
export const metadata = {
  title: "Return & Refund Policy | YOMICO",
  description:
    "Read YOMICO's Return & Refund Policy, including eligibility, refunds, replacements, cancellations, and seller responsibilities.",
};
export default function ReturnRefundPolicyPage() {

  return (

    <div className="min-h-screen bg-gray-50">

      <div className="max-w-5xl mx-auto px-4 py-12">

        <h1 className="text-5xl font-bold text-center mb-8">
          Return & Refund Policy
        </h1>

        <p className="text-center text-gray-500 mb-8">
          Last Updated: July 2026
        </p>
        <p className="text-center text-gray-600 max-w-3xl mx-auto mb-10">
  This Return & Refund Policy explains the eligibility, process, and
  conditions for returns, replacements, cancellations, and refunds on
  YOMICO.
</p>

        <div className="bg-white p-8 rounded-2xl shadow space-y-6">

          <p>

            At YOMICO, customer satisfaction is important to us. This
            Return & Refund Policy explains the conditions under which
            products may be returned, replaced, or refunded.

          </p>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              1. Eligible Returns
            </h2>

            <p>

              Customers may request a return for eligible products that are
              damaged, defective, incorrect, or significantly different
              from the product description, subject to the seller's return
              policy and applicable law.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              2. Return Request Period
            </h2>

            <p>

              Return requests must be submitted within the return period
              displayed on the product page or order details. Requests made
              after the applicable period may not be accepted.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              3. Non-Returnable Products
            </h2>

            <p>

              Certain products, including perishable goods, customized
              items, intimate products, digital goods, and products marked
              as non-returnable, may not be eligible for return unless
              required by applicable law.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              4. Refund Process
            </h2>

            <p>

              Once a returned product has been received and verified,
              eligible refunds will be processed using the original payment
              method or another approved method, depending on the payment
              option used.

            </p>
            <div>

  <h2 className="text-2xl font-bold mb-2">
    Refund Timeline
  </h2>

  <p>
    Once a refund is approved, it is typically processed within
    5–10 business days. The exact time may vary depending on your
    payment method and financial institution.
  </p>

</div>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              5. Replacement Orders
            </h2>

            <p>

              Where applicable, customers may request a replacement instead
              of a refund if the product is eligible and replacement stock
              is available.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              6. Seller Responsibilities
            </h2>

            <p>

              Sellers are responsible for cooperating with YOMICO in the
              return, replacement, and refund process and resolving genuine
              customer issues promptly.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              7. Return Shipping
            </h2>

            <p>

              Depending on the reason for the return, return shipping may
              be arranged by YOMICO, the seller, or the customer in
              accordance with the applicable return policy.

            </p>

          </div>

           <div>

  <h2 className="text-2xl font-bold mb-2">
    8. Cancellation Before Dispatch
  </h2>

  <p>
    Orders may generally be cancelled before they are packed or
    shipped. Once dispatched, cancellation may no longer be
    possible and the Return Policy will apply instead.
  </p>

</div>
          </div>


          <div>

            <h2 className="text-2xl font-bold mb-2">
              9. Fraud Prevention
            </h2>

            <p>

              YOMICO reserves the right to reject fraudulent, abusive,
              or repeated return requests that violate marketplace
              policies.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              10. Contact Us
            </h2>

            <p>

              If you have questions regarding returns or refunds, please
              contact the YOMICO Support Team through the Contact Us
              page.

            </p>

          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">

  <h3 className="text-2xl font-bold mb-2">
    Need Help With a Return?
  </h3>

  <p className="text-gray-600 mb-4">
    If you have questions about returns, refunds, or replacements,
    our support team is here to help.
  </p>

  <Link
    href="/contact"
    className="inline-block bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition"
  >
    Contact Support
  </Link>

</div>

        </div>

      </div>

  );

}