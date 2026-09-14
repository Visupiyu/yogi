// YOMICO Blog — static content structure.
//
// There is no CMS/backend for blog content today, so posts live here as a
// small typed array — one shared source for both the listing page
// (app/blog/page.tsx) and the single reusable article route
// (app/blog/[slug]/page.tsx), rather than duplicating markup per post.
//
// Content rules (deliberate): every post explains something genuinely true
// about how YOMICO already works (matching the real return/refund flow,
// the real Pay on Delivery method, the real seller onboarding steps) or
// gives general, non-fabricated shopping guidance. No invented statistics,
// awards, partnerships, or customer counts.

export type BlogPost = {
  slug: string;
  title: string;
  category: string;
  date: string; // human-readable, e.g. "September 2026"
  excerpt: string;
  content: string[]; // paragraphs, rendered in order
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "how-returns-refunds-work-on-yomico",
    title: "How Returns & Refunds Work on YOMICO",
    category: "Policies",
    date: "September 2026",
    excerpt:
      "A quick guide to requesting a return, what happens during pickup, and how refunds are credited.",
    content: [
      "If something isn't right with an order, you can request a return from your Orders page within the eligible return window. Once submitted, your request goes to our team for review.",
      "After a return is approved, you don't pick the pickup date and time yourself. YOMICO coordinates with a delivery partner and proposes a pickup appointment for you. You can confirm that slot, or ask for a different time if it doesn't work — the pickup only gets scheduled once you've agreed on a time.",
      "Once the item is picked up, it's brought back to YOMICO and passed on for inspection. This step exists so genuine issues are verified fairly, for both customers and sellers.",
      "When a return is approved for refund, the amount is credited to your YOMICO Reward Points balance, which you can use toward future purchases on YOMICO. You can always check the status of a return — including the current stage and any pickup appointment — from your Orders page.",
      "If a return can't be completed (for example, if a pickup attempt doesn't go through), we'll let you know and arrange another attempt rather than closing the request silently.",
    ],
  },
  {
    slug: "getting-started-selling-on-yomico",
    title: "Getting Started: Selling on YOMICO",
    category: "Sellers",
    date: "August 2026",
    excerpt:
      "What to know before you register as a seller and list your first product.",
    content: [
      "YOMICO is a multi-vendor marketplace, which means every product you see is listed and fulfilled by an independent seller. If you sell groceries, fashion, electronics, beauty products or anything in between, you can register as a seller and reach customers through YOMICO.",
      "Getting started begins on the Vendor Register page, where you'll provide your business details. Your application is then reviewed before your seller account is approved — this keeps the marketplace trustworthy for customers.",
      "Depending on your business type (Registered, Composition, or Unregistered under GST), your account may go through a GST/tax verification step before you can start listing. This isn't extra paperwork for its own sake — it's how YOMICO keeps every seller's tax status accurate for customers and for compliance.",
      "Once approved, you can list products, manage stock, and fulfil orders through your Seller Dashboard. Orders, payouts and your seller wallet are all tracked there, so you always know what's pending and what's been settled.",
      "If you're not sure whether your business is a fit, the Sell on YOMICO page and the Seller Agreement are good next stops before you register.",
    ],
  },
  {
    slug: "shopping-safely-on-yomico",
    title: "Shopping Safely on YOMICO",
    category: "Guides",
    date: "July 2026",
    excerpt: "A few simple habits that help you shop with confidence.",
    content: [
      "A few small habits go a long way toward a smooth shopping experience, whether you're new to YOMICO or a regular customer.",
      "Read the full product listing, including seller-provided details like size, specifications and return eligibility, before you buy — this is the same information sellers are responsible for keeping accurate.",
      "Pay the way that suits you: YOMICO supports secure online payments (cards, UPI, net banking) as well as Pay on Delivery (UPI Only) where available. Either way, you'll always see the exact amount before you confirm your order.",
      "Keep an eye on your Orders page after checkout — it's the authoritative place to track status, delivery progress, and any return you've requested.",
      "If anything looks off with an order, a payment, or a delivery, the Contact Us page is the fastest way to reach our support team.",
    ],
  },
  {
    slug: "cash-on-delivery-what-to-expect",
    title: "Cash on Delivery: What to Expect",
    category: "Delivery",
    date: "June 2026",
    excerpt:
      "How Pay on Delivery (UPI Only) works when your order arrives.",
    content: [
      "\"Pay on Delivery\" on YOMICO works a little differently from handing over cash at the door — it's Pay on Delivery (UPI Only), meaning payment is made by UPI at the time of delivery rather than in cash.",
      "When your delivery partner arrives, you'll complete the UPI payment for the exact order amount. Once that payment is submitted, it's verified before your order is marked complete — this protects both you and the seller.",
      "You can always check your order's payment status from your Orders page, including whether a Pay on Delivery payment is still pending or has been verified.",
      "If you'd rather not handle payment at the door at all, YOMICO's regular online payment options (cards, UPI, net banking) are available at checkout for eligible orders.",
    ],
  },
];

export function getAllBlogPosts(): BlogPost[] {
  return BLOG_POSTS;
}

export function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}
