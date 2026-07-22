import Link from "next/link";
export const metadata = {
  title: "Frequently Asked Questions | YOMICO",
  description:
    "Find answers to common questions about shopping, selling, payments, orders, and support on YOMICO.",
};
export default function FAQPage() {

  const faqs = [

    {
      question: "How do I place an order?",
      answer:
        "Browse products, add them to your cart, and proceed to checkout."
    },

    {
      question: "How can I become a seller?",
      answer:
        "Click on Vendor Register, complete the registration process, and wait for your account to be reviewed and approved before you can start selling."
    },

    {
      question: "Which payment methods are supported?",
      answer:
        "We support Razorpay payments, UPI, cards, net banking, and Cash on Delivery where available."
    },

    {
      question: "Can I track my order?",
      answer:
        "Yes. Visit the Orders page to check your order status and tracking progress."
    },

    {
      question: "How do I contact support?",
      answer:
        "Visit the Contact Us page and send us a message."
    },

    {
      question: "Can I cancel an order?",
      answer:
        "Orders can be cancelled before they are shipped. Once shipped, you may be eligible for a return according to our Cancellation and Return Policy."
    },

 {
  question:
    "Can I return a product?",

  answer:
    "Yes. Eligible products can be returned within the applicable return period. Please refer to our Return Policy for complete details."
},

{
  question:
    "When do vendors receive payouts?",

  answer:
    "Vendor payouts are processed according to the YOMICO payout schedule."
},

{
  question:
    "Do I need an account to place an order?",

  answer:
    "Yes. Please create an account and login before checkout."
},

  ];

  return (

    <div className="min-h-screen bg-gray-50">

      <div className="max-w-5xl mx-auto px-4 py-12">

        <h1 className="text-5xl font-bold text-center mb-4">
          Frequently Asked Questions
        </h1>

        <p className="text-center text-gray-500 mb-4">
  Last Updated: July 2026
</p>
<p className="text-center text-gray-600 max-w-3xl mx-auto mb-12">
  Browse answers to the most frequently asked questions about shopping,
  selling, payments, returns, and account management on YOMICO.
</p>

        <div className="space-y-6">

          {faqs.map((faq,index)=>(

            <div
              key={index}
              className="
                bg-white
                p-6
                rounded-2xl
                shadow
              "
            >

              <h2 className="
                text-xl
                font-bold
                mb-3
              ">
                {faq.question}
              </h2>

              <p className="text-gray-600">
                {faq.answer}
              </p>

            </div>

          ))}

          <div className="mt-12 bg-green-50 border border-green-200 rounded-xl p-6 text-center">

  <h2 className="text-2xl font-bold mb-2">
    Didn't Find Your Answer?
  </h2>

  <p className="text-gray-600 mb-4">
    Our support team is here to help with any additional questions.
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