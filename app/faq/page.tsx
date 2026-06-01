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
        "Click on 'Vendor Register' and complete the registration process."
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
        "Orders can be cancelled before they are shipped."
    }

  ];

  return (

    <div className="min-h-screen bg-gray-50">

      <div className="max-w-5xl mx-auto px-4 py-12">

        <h1 className="text-5xl font-bold text-center mb-4">
          Frequently Asked Questions
        </h1>

        <p className="text-center text-gray-600 mb-12">
          Find answers to the most common questions about Yogi-Mart.
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

        </div>

      </div>

    </div>

  );

}