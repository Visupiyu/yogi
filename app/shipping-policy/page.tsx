import Link from "next/link";

export const metadata = {
  title: "Shipping Policy | YOMICO",
  description:
    "Learn about YOMICO's shipping process, delivery timelines, tracking, shipping charges, and customer support.",
};
export default function ShippingPolicyPage() {

  return (

    <div className="min-h-screen bg-gray-50">

      <div className="max-w-5xl mx-auto px-4 py-12">

        <h1 className="text-5xl font-bold text-center mb-8">
          Shipping Policy
        </h1>

        <p className="text-center text-gray-500 mb-8">
          Last Updated: July 2026
        </p>
        <p className="text-center text-gray-600 max-w-3xl mx-auto mb-10">
  This Shipping Policy explains how YOMICO processes, ships, tracks,
  and delivers orders, along with important information about shipping
  charges, delivery timelines, and customer responsibilities.
</p>

        <div className="bg-white p-8 rounded-2xl shadow space-y-6">

          <p>

            This Shipping Policy explains how orders placed on the
            YOMICO Marketplace are processed, shipped, and delivered.

          </p>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              1. Order Processing
            </h2>

            <p>

              Orders are processed after successful payment confirmation or
              order verification for Cash on Delivery (COD). Sellers are
              responsible for preparing orders for dispatch within the
              promised handling time.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              2. Delivery Partners
            </h2>

            <p>

              YOMICO may use its own delivery network or trusted
              third-party logistics partners to deliver orders safely and
              efficiently.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              3. Estimated Delivery Time
            </h2>

            <p>

              Estimated delivery dates are provided for convenience only.
              Actual delivery times may vary due to seller processing,
              courier operations, weather conditions, public holidays, or
              other unforeseen circumstances.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              4. Shipping Charges
            </h2>

            <p>

              Shipping charges, if applicable, are displayed during the
              checkout process before payment confirmation.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              5. Delivery Attempts
            </h2>

            <p>

              Delivery partners may make multiple delivery attempts. If an
              order cannot be delivered due to an incorrect address,
              customer unavailability, or refusal to accept delivery, the
              order may be returned to the seller.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              6. Order Tracking
            </h2>

            <p>

              Customers can track their orders through the YOMICO platform whenever tracking information is available. Tracking details will be updated as provided by the seller or delivery partner.
            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              7. Delays
            </h2>

            <p>

              While YOMICO aims to ensure timely deliveries, we are not
              responsible for delays caused by natural disasters,
              government restrictions, strikes, transportation issues, or
              other events beyond our reasonable control.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              8. Damaged Packages
            </h2>

            <p>

              Customers are encouraged to inspect packages upon delivery
              and report any damaged or missing items promptly through
              YOMICO Support.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              9. International Shipping
            </h2>

            <p>

              Unless specifically stated otherwise, YOMICO currently
              provides shipping services only within India.

            </p>

          </div>

          <div>

  <h2 className="text-2xl font-bold mb-2">
    10. Delivery Coverage
  </h2>

  <p>
    YOMICO delivers to most serviceable locations across India.
    Delivery availability may vary depending on the seller's location,
    courier partner coverage, and local serviceability.
  </p>

</div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              11. Contact Us
            </h2>

            <p>

              If you have questions regarding shipping or delivery, please
              contact the YOMICO Support Team through the Contact Us
              page.

            </p>

          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">

  <h3 className="text-2xl font-bold mb-2">
    Need Help With Delivery?
  </h3>

  <p className="text-gray-600 mb-4">
    If you have questions about shipping, delivery, or tracking your order,
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

    </div>

  );

}