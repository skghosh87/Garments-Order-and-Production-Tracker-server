require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

/* =====================================================
   1. MIDDLEWARES
===================================================== */
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://assignment11-garments-tracker.netlify.app", // production URL
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

/* =====================================================
   2. MONGODB CONNECTION
===================================================== */
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@skghosh.wrzjkjg.mongodb.net/?appName=Skghosh`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect(); // Production-এ অনেক সময় এটি ছাড়াই কাজ করে
    console.log("Connected to MongoDB!");

    const db = client.db("garmentsTrackerDB");
    const usersCollection = db.collection("users");
    const productCollection = db.collection("products");
    const ordersCollection = db.collection("orders");

    /* =====================================================
       3. AUTH & JWT MIDDLEWARES
    ===================================================== */
    const verifyToken = async (req, res, next) => {
      try {
        const token = req.cookies?.token;

        // ১. টোকেন না থাকলে সরাসরি রির্টান
        if (!token) {
          return res
            .status(401)
            .send({ message: "Unauthorized access - No token found" });
        }

        // ২. JWT ভেরিফিকেশন (Error handling সহ)
        jwt.verify(
          token,
          process.env.ACCESS_TOKEN_SECRET,
          async (err, decoded) => {
            if (err) {
              // যদি টোকেনের মেয়াদ শেষ হয়ে যায় (Expired)
              if (err.name === "TokenExpiredError") {
                return res
                  .status(401)
                  .send({ message: "Token expired. Please login again." });
              }
              // অন্য কোনো কারণে টোকেন ইনভ্যালিড হলে
              return res
                .status(403)
                .send({ message: "Forbidden - Invalid token" });
            }

            // ৩. ডাটাবেজ থেকে লেটেস্ট তথ্য আনা (Try-catch এর ভেতরে)
            try {
              const user = await usersCollection.findOne({
                email: decoded.email,
              });
              if (!user) {
                return res
                  .status(404)
                  .send({ message: "User not found in database" });
              }

              // ৪. রিকোয়েস্ট অবজেক্টে ডাটা সেট করা
              req.user = {
                email: user.email,
                role: user.role,
                status: user.status,
              };

              next(); // সফল হলে পরবর্তী ধাপে যাবে
            } catch (dbError) {
              console.error("Database error in verifyToken:", dbError);
              res.status(500).send({ message: "Internal Server Error" });
            }
          }
        );
      } catch (error) {
        // যেকোনো অপ্রত্যাশিত এরর হ্যান্ডেল করবে যাতে সার্ভার বন্ধ না হয়
        console.error("Critical error in verifyToken middleware:", error);
        res.status(500).send({ message: "Authentication process failed" });
      }
    };

    const verifyAdmin = async (req, res, next) => {
      if (req.user?.role?.toLowerCase() !== "admin") {
        return res.status(403).send({ message: "Forbidden: Admin only" });
      }
      next();
    };

    const verifyManager = async (req, res, next) => {
      if (req.user?.role?.toLowerCase() !== "manager") {
        return res.status(403).send({ message: "Forbidden: Manager only" });
      }
      next();
    };

    // 🔐 JWT Generate & Logout

    app.post("/api/v1/auth/jwt", async (req, res) => {
      const { email } = req.body;
      const user = await usersCollection.findOne({ email });
      if (!user) return res.status(401).send({ message: "User not found" });

      // টোকেনে শুধুমাত্র ইমেইল রাখা নিরাপদ, রোল সরাসরি DB থেকে যাচাই করা ভালো
      const token = jwt.sign(
        { email: user.email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "7d" }
      );

      res
        .cookie("token", token, {
          httpOnly: true, // জাভাস্ক্রিপ্ট দিয়ে এক্সেস করা যাবে না (XSS Protection)
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
          maxAge: 7 * 24 * 60 * 60 * 1000, // ৭ দিন স্থায়িত্ব
          path: "/", // পুরো সাইটে কুকিটি কাজ করবে
        })
        .send({
          success: true,
          user: {
            email: user.email,
            role: user.role,
            status: user.status,
            displayName: user.displayName,
          },
        });
    });

    // 🔓 Logout (সংশোধিত)
    app.post("/api/v1/auth/logout", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
          path: "/",
        })
        .send({ success: true });
    });
    /* =====================================================
       4. USERS API
    ===================================================== */
    app.post("/api/v1/users", async (req, res) => {
      const user = req.body;
      const exists = await usersCollection.findOne({ email: user.email });
      if (exists) return res.send({ message: "Exists" });
      const result = await usersCollection.insertOne({
        ...user,
        role: "buyer",
        status: "pending",
        createdAt: new Date(),
      });
      res.send(result);
    });

    app.get("/api/v1/users", verifyToken, verifyAdmin, async (req, res) => {
      const search = req.query.search || "";
      const query = {
        $or: [
          { displayName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/api/v1/users/role/:email", async (req, res) => {
      const user = await usersCollection.findOne({ email: req.params.email });
      res.send(user || { role: "buyer", status: "pending" });
    });

    app.patch(
      "/api/v1/users/role/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { role: req.body.role } }
        );
        res.send(result);
      }
    );

    app.patch(
      "/api/v1/users/suspend/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          {
            $set: {
              status: "suspended",
              suspensionReason: req.body.reason,
              suspensionFeedback: req.body.feedback,
            },
          }
        );
        res.send(result);
      }
    );

    /* =====================================================
       5. PRODUCTS API (Refined & Working)
    ===================================================== */
    app.get("/api/v1/products", async (req, res) => {
      try {
        const isHome = req.query.home === "true";
        const limit = parseInt(req.query.limit) || 0;
        const email = req.query.email;

        let query = {};
        if (isHome) query = { status: "active" };
        else if (email) query = { "addedBy.email": email };

        const result = await productCollection
          .find(query)
          .sort({ createdAt: -1 })
          .limit(limit)
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send(error);
      }
    });

    app.post(
      "/api/v1/products",
      verifyToken,
      verifyManager,
      async (req, res) => {
        const product = req.body;
        if (!product.name || !product.price || !product.paymentOption)
          return res.status(400).send({ message: "Missing fields" });
        const result = await productCollection.insertOne({
          ...product,
          status: "active",
          createdAt: new Date(),
        });
        res.status(201).send(result);
      }
    );

    app.put(
      "/api/v1/products/:id",
      verifyToken,
      verifyManager,
      async (req, res) => {
        const result = await productCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { ...req.body, updatedAt: new Date() } }
        );
        res.send(result);
      }
    );
    // PUT বা PATCH: অ্যাডমিন এবং ম্যানেজার উভয়েই যেন আপডেট করতে পারে
    app.patch(
      "/api/v1/products/:id",
      verifyToken,

      async (req, res) => {
        const id = req.params.id;
        const body = req.body;
        const filter = { _id: new ObjectId(id) };

        const updatedDoc = {
          $set: {
            name: body.name,
            price: body.price,
            category: body.category,
            description: body.description,
            videoUrl: body.videoUrl,
            paymentOptions: body.paymentOptions, // ফ্রন্টএন্ডের ড্রপডাউন থেকে আসা ভ্যালু
            image: body.image,
            updatedAt: new Date(),
          },
        };

        try {
          const result = await productCollection.updateOne(filter, updatedDoc);
          res.send(result);
        } catch (error) {
          res.status(500).send({ message: "Update failed", error });
        }
      }
    );
    app.patch(
      "/api/v1/products/toggle-home/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const { showOnHome } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { showOnHome: showOnHome },
        };
        const result = await productCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    app.delete(
      "/api/v1/products/:id",
      verifyToken,
      verifyManager,
      async (req, res) => {
        const result = await productCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        res.send(result);
      }
    );

    /* =====================================================
       6. ORDERS & BOOKINGS API
    ===================================================== */
    app.post("/api/v1/orders", verifyToken, async (req, res) => {
      const { role, status } = req.user;
      const orderData = req.body;

      // ১. বায়ার চেক (Case-insensitive: ডাটাবেসে Buyer বা buyer যাই থাকুক কাজ করবে)
      if (role?.toLowerCase() !== "buyer") {
        return res.status(403).send({
          success: false,
          message: "Access Denied: Only Buyers can place orders",
        });
      }

      // ২. সাসপেনশন চেক
      if (status === "suspended") {
        return res.status(403).send({
          success: false,
          message: "Your account is suspended!",
        });
      }

      try {
        // ৩. অর্ডার সেভ করা
        const result = await ordersCollection.insertOne({
          ...orderData,
          status: "pending",
          createdAt: new Date(),
        });

        // ৪. ডায়নামিকভাবে স্টক বিয়োগ করা (Atomic Operation)
        const updateStock = await productCollection.updateOne(
          { _id: new ObjectId(orderData.productId) },
          { $inc: { quantity: -parseInt(orderData.orderQuantity) } }
        );

        res.send({ success: true, result, updateStock });
      } catch (error) {
        res.status(500).send({ message: "Order placement failed" });
      }
    });

    app.get("/api/v1/orders/my-orders", verifyToken, async (req, res) => {
      try {
        // অর্ডারের সময় আমরা 'buyerEmail' হিসেবে সেভ করেছি, তাই এখানেও সেটিই ব্যবহার করতে হবে
        const email = req.user?.email;

        if (!email) {
          return res
            .status(401)
            .send({ message: "Unauthorized: User email not found" });
        }

        const result = await ordersCollection
          .find({ buyerEmail: email }) // 'userEmail' এর পরিবর্তে 'buyerEmail' দিন
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });
    //order Cancel
    app.patch("/api/v1/orders/cancel/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id), status: "pending" }; // শুধুমাত্র পেন্ডিং অর্ডার ক্যানসেল করা যাবে
      const updateDoc = {
        $set: { status: "cancelled" },
      };
      const result = await ordersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    //update order status
    app.patch("/api/v1/orders/status/:id", verifyToken, async (req, res) => {
      const result = await ordersCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        {
          $set: { status: req.body.status, updatedAt: new Date() },
          $push: {
            trackingHistory: { status: req.body.status, time: new Date() },
          },
        }
      );
      res.send(result);
    });
    app.get("/api/v1/orders/details/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const result = await ordersCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });
    // Track Order by ID
    app.get("/api/v1/orders/track/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id; // ফ্রন্টএন্ড থেকে আসা orderId এখানে 'id' হিসেবে আসবে
        const email = req.user.email; // verifyToken থেকে আসা ইউজারের ইমেইল

        // ডাটাবেস কোয়েরি
        const query = {
          _id: new ObjectId(id),
          buyerEmail: email, // বায়ারের ইমেইল দিয়ে ফিল্টার করা জরুরি যেন অন্য কেউ না দেখে
        };

        const result = await ordersCollection.findOne(query);

        if (!result) {
          return res.status(404).send({ message: "Order not found" });
        }

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Internal server error" });
      }
    });
    //Pending Orders List & Approve/Reject
    // ১. পেন্ডিং অর্ডার লিস্ট আনা
    app.get("/api/v1/manager/pending-orders", verifyToken, async (req, res) => {
      const result = await ordersCollection
        .find({ status: "pending" })
        .toArray();
      res.send(result);
    });

    // ২. অর্ডার এপ্রুভ করা (status + timestamp)
    app.patch("/api/v1/orders/approve/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "approved",
          approvedAt: new Date(), // এপ্রুভ করার সময় লগ করা
        },
      };
      const result = await ordersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // ৩. অর্ডার রিজেক্ট করা
    app.patch("/api/v1/orders/reject/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: { status: "rejected" } };
      const result = await ordersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    //Approved and Tracking

    // ১. ম্যানেজার এপ্রুভড অর্ডার দেখার জন্য
    app.get(
      "/api/v1/manager/approved-orders",
      verifyToken,
      async (req, res) => {
        const result = await ordersCollection
          .find({ status: "approved" })
          .toArray();
        res.send(result);
      }
    );

    // ট্র্যাকিং আপডেট করার রুট
    app.patch(
      "/api/v1/orders/update-tracking/:id",
      verifyToken,
      // verifyManager, // যদি আপনার কাছে এই মিডলওয়্যারটি থাকে তবে এটি যোগ করুন
      async (req, res) => {
        try {
          const id = req.params.id;
          const trackingData = req.body;

          // আইডি ভ্যালিড কি না চেক করা
          if (!id || id.length !== 24) {
            return res.status(400).send({ message: "Invalid Order ID" });
          }

          const filter = { _id: new ObjectId(id) };

          const updateDoc = {
            $set: {
              // বর্তমান সর্বশেষ ধাপটি এখানে থাকবে যা টেবিল লিস্টে দেখাবে
              currentTrackingStatus: trackingData.status,
              // আপনি চাইলে সর্বশেষ আপডেটের সময়টিও সেট করে রাখতে পারেন
              lastUpdatedAt: new Date(),
            },
            $push: {
              // টাইমলাইন দেখানোর জন্য অ্যারেতে নতুন অবজেক্ট পুশ হবে
              trackingHistory: {
                ...trackingData,
                updatedAt: new Date(), // সার্ভার সাইড থেকে সময় সেট করা নিরাপদ
              },
            },
          };

          const result = await ordersCollection.updateOne(filter, updateDoc);

          if (result.modifiedCount > 0) {
            res.send(result);
          } else {
            res
              .status(404)
              .send({ message: "Order not found or no changes made" });
          }
        } catch (error) {
          console.error("Tracking Update Error:", error);
          res.status(500).send({ message: "Internal server error" });
        }
      }
    );
    // অ্যাডমিন সব অর্ডার দেখবে (Verify Admin নিশ্চিত করবেন)
    app.get(
      "/api/v1/admin/all-orders",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const result = await ordersCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      }
    );
    /* =====================================================
       7. PAYMENTS (STRIPE)
    ===================================================== */
    /**
     * ১. পেমেন্ট ইনটেন্ট তৈরি করা
     * ফ্রন্টএন্ড থেকে আসা প্রাইস অনুযায়ী এটি একটি Secret Key জেনারেট করে
     */
    app.post("/api/v1/create-payment-intent", async (req, res) => {
      try {
        const { price } = req.body;

        // স্ট্রাইপ সেন্ট (Cents) হিসেবে টাকা গ্রহণ করে, তাই ১০০ দিয়ে গুণ করতে হয়
        const amount = parseInt(price * 100);

        if (!price || amount < 1) {
          return res.status(400).send({ message: "Invalid price" });
        }

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error("Payment Intent Error:", error);
        res.status(500).send({ error: error.message });
      }
    });

    /**
     * ২. অর্ডারের পেমেন্ট স্ট্যাটাস আপডেট করা (PATCH)
     * পেমেন্ট সফল হওয়ার পর ফ্রন্টএন্ড থেকে এই এপিআই কল করা হয়
     */
    app.patch("/api/v1/orders/payment/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const paymentData = req.body; // এতে থাকবে transactionId এবং status

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: "Paid",
            transactionId: paymentData.transactionId,
            paymentDate: paymentData.paymentDate || new Date(),
            paymentMethod: "Stripe",
          },
        };

        const result = await ordersCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount > 0) {
          res.send({ success: true, modifiedCount: result.modifiedCount });
        } else {
          res.status(404).send({
            success: false,
            message: "Order not found or already updated",
          });
        }
      } catch (error) {
        console.error("Update Payment Error:", error);
        res.status(500).send({ error: error.message });
      }
    });

    /* =====================================================
   GET SINGLE PRODUCT BY ID (For View Details)
===================================================== */
    app.get("/api/v1/products/:id", async (req, res) => {
      try {
        const id = req.params.id;

        // ১. চেক করা আইডিটি মঙ্গোডিবি'র ObjectId ফরম্যাটে সঠিক কি না
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid Product ID format" });
        }

        const query = { _id: new ObjectId(id) };

        // ২. ডাটাবেস থেকে প্রোডাক্টটি খোঁজা
        const result = await productCollection.findOne(query);

        if (!result) {
          return res
            .status(404)
            .send({ message: "Product not found in database" });
        }

        res.send(result);
      } catch (error) {
        console.error("Error fetching single product:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });
    // ইউজারের স্ট্যাটাস (Pending থেকে Verified) পরিবর্তন করার রুট
    app.patch(
      "/api/v1/users/status/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const { status } = req.body; // ফ্রন্টএন্ড থেকে 'verified' পাঠানো হবে
          const filter = { _id: new ObjectId(id) };
          const updateDoc = {
            $set: { status: status },
          };
          const result = await usersCollection.updateOne(filter, updateDoc);
          res.send(result);
        } catch (error) {
          res.status(500).send({ message: "Status update failed" });
        }
      }
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => res.send("Garments API Running"));
app.listen(port, () => console.log(`Server on port ${port}`));
