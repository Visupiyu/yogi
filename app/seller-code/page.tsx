import Link from "next/link";

export const metadata = {
  title: "Seller Code of Conduct | YOMICO",
  description:
    "Read the YOMICO Seller Code of Conduct, including seller responsibilities, product standards, customer service expectations, and marketplace policies.",
};
export default function SellerCodePage() {

  return (

    <div className="min-h-screen bg-gray-50">

      <div className="max-w-5xl mx-auto px-4 py-12">

        <h1 className="text-5xl font-bold text-center mb-8">
          Seller Code of Conduct
        </h1>

        <p className="text-center text-gray-500 mb-8">
          Last Updated: July 2026
        </p>
        <p className="text-center text-gray-600 max-w-3xl mx-auto mb-10">
  This Seller Code of Conduct outlines the standards, responsibilities,
and expected behavior for all sellers using the YOMICO marketplace.
</p>

        <div className="bg-white p-8 rounded-2xl shadow space-y-6">

          <p>

            This Seller Code of Conduct outlines the standards every seller
            must follow while using the YOMICO Marketplace. Compliance
            with these guidelines helps maintain a trusted shopping
            experience for customers.

          </p>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              1. Honest Business Practices
            </h2>

            <p>

              Sellers must provide accurate business information and conduct
              business honestly, fairly, and in compliance with applicable
              laws.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              2. Accurate Product Listings
            </h2>

            <p>

              Product titles, descriptions, specifications, pricing,
              images, and stock availability must always be accurate and
              up to date.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              3. Genuine Products
            </h2>

            <p>

              Counterfeit, fake, illegal, prohibited, or unsafe products
              are strictly prohibited on YOMICO.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              4. Inventory Management
            </h2>

            <p>

              Sellers are responsible for maintaining sufficient inventory
              and updating stock levels promptly.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              5. Order Fulfilment
            </h2>

            <p>

              Confirmed orders must be packed and dispatched within the
              promised handling time.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              6. Customer Service
            </h2>

            <p>

              Sellers must communicate professionally and resolve customer
              concerns promptly.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              7. Returns and Refunds
            </h2>

            <p>

              Sellers must cooperate with YOMICO in processing eligible
              returns, replacements, and refunds according to marketplace
              policies.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              8. Legal Compliance
            </h2>

            <p>

              Sellers are responsible for complying with GST regulations,
              consumer protection laws, intellectual property rights, and
              all other applicable legal requirements.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              9. Policy Violations
            </h2>

            <p>

              Violation of this Code of Conduct may result in product
              removal, account suspension, permanent termination, or legal
              action where applicable.

            </p>

          </div>
          <div>

  <h2 className="text-2xl font-bold mb-2">
    10. Continuous Compliance
  </h2>

  <p>
    Sellers are expected to regularly review YOMICO's marketplace
    policies and ensure ongoing compliance with all applicable rules,
    standards, and legal requirements.
  </p>

</div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              11. Contact Seller Support
            </h2>

            <p>

              For questions regarding this Seller Code of Conduct, please
              contact the YOMICO Seller Support Team through the Contact
              Us page.

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