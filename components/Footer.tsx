export default function Footer(){

  return (

    <footer
      style={{
        background:"#000",
        color:"#fff",
        marginTop:"80px"
      }}
    >

      <div
        className="
          max-w-7xl
          mx-auto
          grid
          md:grid-cols-4
          gap-10
          px-6
          py-14
        "
      >

        <div>

          <h2
            style={{
              fontSize:"32px",
              fontWeight:"bold",
              marginBottom:"20px"
            }}
          >

            Yogi Mart

          </h2>

          <p
            style={{
              color:"#aaa",
              lineHeight:"28px"
            }}
          >

            Modern ecommerce marketplace
            for fashion, electronics,
            grocery and more.

          </p>

        </div>

        <div>

          <h3
            style={{
              fontSize:"22px",
              fontWeight:"bold",
              marginBottom:"20px"
            }}
          >

            About

          </h3>

          <ul
            style={{
              color:"#aaa",
              lineHeight:"35px"
            }}
          >

            <li>About Us</li>

            <li>Careers</li>

            <li>Press</li>

          </ul>

        </div>

        <div>

          <h3
            style={{
              fontSize:"22px",
              fontWeight:"bold",
              marginBottom:"20px"
            }}
          >

            Help

          </h3>

          <ul
            style={{
              color:"#aaa",
              lineHeight:"35px"
            }}
          >

            <li>Contact</li>

            <li>Returns</li>

            <li>Privacy Policy</li>

          </ul>

        </div>

        <div>

          <h3
            style={{
              fontSize:"22px",
              fontWeight:"bold",
              marginBottom:"20px"
            }}
          >

            Follow Us

          </h3>

          <ul
            style={{
              color:"#aaa",
              lineHeight:"35px"
            }}
          >

            <li>Instagram</li>

            <li>Facebook</li>

            <li>Twitter</li>

          </ul>

        </div>

      </div>

      <div
        style={{
          borderTop:"1px solid #222",
          textAlign:"center",
          padding:"20px",
          color:"#777"
        }}
      >

        © 2026 Yogi Mart.
        All Rights Reserved.

      </div>

    </footer>

  );

}