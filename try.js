const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

/* =====================================================
   1. MIDDLEWARES
===================================================== */
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://your-client-site.web.app", // production
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

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    const db = client.db("garmentsTrackerDB");
    const usersCollection = db.collection("users");
    const productCollection = db.collection("products");
    const ordersCollection = db.collection("orders");

    /* =====================================================
       3. JWT & AUTH
    ===================================================== */

    // 🔐 Generate JWT
    app.post("/api/v1/auth/jwt", async (req, res) => {
      const { email } = req.body;

      const user = await usersCollection.findOne({ email });

      if (!user) {
        return res.status(401).send({ message: "User not found" });
      }

      const payload = {
        email: user.email,
        role: user.role,
        status: user.status,
      };

      const token = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "7d",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        })
        .send({
          success: true,
          user: {
            email: user.email,
            role: user.role,
            status: user.status,
          },
        });
    });

    // 🚪 Logout
    app.post("/api/v1/auth/logout", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
          maxAge: 0,
        })
        .send({ success: true });
    });

    /* =====================================================
       4. AUTH MIDDLEWARES
    ===================================================== */

    const verifyToken = async (req, res, next) => {
      const token = req.cookies?.token;
      if (!token) {
        return res
          .status(401)
          .send({ message: "Unauthorized: No token provided" });
      }

      jwt.verify(
        token,
        process.env.ACCESS_TOKEN_SECRET,
        async (err, decoded) => {
          if (err) {
            return res
              .status(401)
              .send({ message: "Invalid or expired token" });
          }

          const user = await usersCollection.findOne({ email: decoded.email });

          req.user = { ...decoded, status: user?.status };
          next();
        }
      );
    };

    const verifyAdmin = async (req, res, next) => {
      if (req.user?.role?.toLowerCase() !== "admin") {
        return res.status(403).send({ message: "Forbidden: Admin only" });
      }
      next();
    };

    // ম্যানেজার কি না তা যাচাই করা
    const verifyManager = async (req, res, next) => {
      const email = req.user?.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query); // আপনার ইউজার কালেকশন থেকে

      if (user?.role?.toLowerCase() !== "manager") {
        return res.status(403).send({ message: "Forbidden: Managers only" });
      }
      next();
    };

    /* =====================================================
       5. USERS API
    ===================================================== */

    // ➕ Save user on Register
    app.post("/api/v1/users", async (req, res) => {
      const user = req.body;

      const exists = await usersCollection.findOne({ email: user.email });
      if (exists) {
        return res.send({ message: "User already exists" });
      }

      const newUser = {
        ...user,
        role: user.role || "buyer",
        status: "pending",
        createdAt: new Date(),
      };

      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    // 🔍 Get user role & status
    app.get("/api/v1/users/role/:email", async (req, res) => {
      const email = req.params.email;

      const user = await usersCollection.findOne({ email });

      if (!user) {
        return res.send({ role: "buyer", status: "pending" });
      }

      res.send({
        role: user.role,
        status: user.status,
        suspensionReason: user.suspensionReason || "",
        suspensionFeedback: user.suspensionFeedback || "",
      });
    });
    /* =====================================================
   Admin: Manage User Roles & Status
===================================================== */

    // ১. ইউজারের রোল পরিবর্তন করার রুট
    app.patch(
      "/api/v1/users/role/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const { role } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { role: role },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // ২. ইউজারকে সাসপেন্ড করার রুট (Reason ও Feedback সহ)
    app.patch(
      "/api/v1/users/suspend/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const { reason, feedback } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: "suspended",
            suspensionReason: reason,
            suspensionFeedback: feedback,
          },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );
    /* =====================================================
   Admin: Get All Users (ManageUsers.jsx এর জন্য)
===================================================== */
    app.get("/api/v1/users", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const search = req.query.search || "";

        // সার্চ কোয়েরি তৈরি করা (নাম বা ইমেইল দিয়ে সার্চ করার জন্য)
        const query = {
          $or: [
            { displayName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        };

        const result = await usersCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });
    /* =====================================================
   User: Update Profile (displayName & photoURL)
===================================================== */
    app.patch("/api/v1/users/update-profile", verifyToken, async (req, res) => {
      try {
        const { email, displayName, photoURL } = req.body;

        // সাসপেন্ডেড ইউজার কিনা চেক করা (নিরাপত্তার জন্য)
        const user = await usersCollection.findOne({ email: email });
        if (user?.status === "suspended") {
          return res
            .status(403)
            .send({ message: "Suspended accounts cannot update profile." });
        }

        const filter = { email: email };
        const updateDoc = {
          $set: {
            displayName: displayName,
            photoURL: photoURL,
          },
        };

        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send({ success: true, modifiedCount: result.modifiedCount });
      } catch (error) {
        res.status(500).send({ message: "Failed to update profile" });
      }
    });
    /* =====================================================
       6. TEST PROTECTED ROUTE
    ===================================================== */
    app.get("/api/v1/protected", verifyToken, (req, res) => {
      res.send({
        message: "Protected route access success",
        user: req.user,
      });
    });

    /* =====================================================
       8. Product Route 
    ===================================================== */
    // 1. প্রোডাক্ট যোগ করার পোস্ট রুট
    app.post(
      "/api/v1/products",
      verifyToken,
      verifyManager,
      async (req, res) => {
        try {
          const product = req.body;

          if (!product.name || !product.price || !product.quantity) {
            return res.status(400).send({ message: "Missing required fields" });
          }

          const result = await productCollection.insertOne(product);
          res.status(201).send(result);
        } catch (error) {
          console.error("Error adding product:", error);
          res.status(500).send({ message: "Internal server error" });
        }
      }
    );

    // 2. সকল প্রোডাক্ট পাওয়ার রুট (GET)
    app.get("/api/v1/products", async (req, res) => {
      try {
        const result = await productCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching products" });
      }
    });
    /* =====================================================
   প্রোডাক্ট পাওয়ার রুট (Filter & Limit সহ)
===================================================== */
    app.get("/api/v1/products", async (req, res) => {
      try {
        const isHome = req.query.home === "true";
        const limit = parseInt(req.query.limit) || 0;

        let query = {};
        if (isHome) {
          // যদি ডাটাবেসে showOnHome ফিল্ডটি না থাকে, তবে এটি শুধু limit(6) দিয়ে ডাটা আনবে
          // অথবা আপনি আপনার মতো করে নির্দিষ্ট ফিল্টার রাখতে পারেন
          query = { showOnHome: true };
        }

        const result = await productCollection
          .find(query)
          .sort({ _id: -1 }) // নতুন প্রোডাক্টগুলো আগে দেখানোর জন্য
          .limit(limit)
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching products" });
      }
    });

    // ২. প্রোডাক্ট ডিটেইলস এন্ডপয়েন্ট
    app.get("/api/v1/products/:id", async (req, res) => {
      try {
        const id = req.params.id;

        // আইডি ভ্যালিড কি না তা চেক করা
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid Product ID" });
        }

        const query = { _id: new ObjectId(id) };

        // আপনার প্রোডাক্ট কালেকশনের নাম এখানে ব্যবহার করুন (ধরা যাক productCollection)
        const result = await productCollection.findOne(query);

        if (!result) {
          return res.status(404).send({ message: "Product not found" });
        }

        res.send(result);
      } catch (error) {
        console.error("Error fetching product details:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });
    // 3. প্রোডাক্ট ডিলিট করার রুট (DELETE)
    app.delete(
      "/api/v1/products/:id",
      verifyToken,
      verifyManager,
      async (req, res) => {
        try {
          const id = req.params.id;
          const query = { _id: new ObjectId(id) };
          const result = await productCollection.deleteOne(query);
          res.send(result);
        } catch (error) {
          res.status(500).send({ message: "Error deleting product" });
        }
      }
    );

    // 4. প্রোডাক্ট আপডেট করার রুট (PUT)
    app.put(
      "/api/v1/products/:id",
      verifyToken,
      verifyManager,
      async (req, res) => {
        try {
          const id = req.params.id;
          const filter = { _id: new ObjectId(id) };
          const updatedProduct = req.body;

          const updateDoc = {
            $set: {
              name: updatedProduct.name,
              price: updatedProduct.price,
              quantity: updatedProduct.quantity,
              category: updatedProduct.category,
              description: updatedProduct.description,
              image: updatedProduct.image,
            },
          };

          const result = await productCollection.updateOne(filter, updateDoc);
          res.send(result);
        } catch (error) {
          res.status(500).send({ message: "Error updating product" });
        }
      }
    );
    //Patch API to update product
    app.patch("/api/v1/products/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const data = req.body;

        const updatedDoc = {
          $set: {
            name: data.name,
            price: parseFloat(data.price),
            quantity: parseInt(data.quantity), // আপনার ডাটাবেস ফিল্ড
            category: data.category,
            addedBy: data.addedBy,
            image: data.image,
          },
        };

        // এখানে নিশ্চিত করুন নামটি productCollection (আপনার ডিক্লারেশন অনুযায়ী)
        const result = await productCollection.updateOne(filter, updatedDoc);

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Product not found" });
        }

        res.send(result);
      } catch (error) {
        console.error("Update Error:", error);
        res.status(500).send({ message: "Server Error: " + error.message });
      }
    });
    /* =====================================================
       8. Orders Route 
    ===================================================== */
    app.post("/api/v1/orders", verifyToken, async (req, res) => {
      // চেক করুন ইউজার সাসপেন্ডেড কি না
      if (req.user.status === "suspended") {
        return res.status(403).send({
          message: "Your account is suspended. You cannot place new orders.",
        });
      }

      const orderData = req.body;
      const result = await ordersCollection.insertOne(orderData);
      res.send(result);
    });
    // Get Api to fetch all orders
    app.get("/api/v1/orders", verifyToken, async (req, res) => {
      const result = await ordersCollection.find().toArray();
      res.send(result);
    });
    /* =====================================================
   Admin/Manager: Update Order Status
===================================================== */
    app.patch("/api/v1/orders/status/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;
        const filter = { _id: new ObjectId(id) };

        // স্ট্যাটাস পরিবর্তনের সাথে সাথে একটি ট্র্যাকিং হিস্ট্রি যোগ করা (অপশনাল কিন্তু ভালো)
        const updateDoc = {
          $set: {
            status: status,
            updatedAt: new Date(),
          },
          $push: {
            trackingHistory: {
              status: status,
              time: new Date(),
            },
          },
        };

        const result = await ordersCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount > 0) {
          res.send({ success: true, modifiedCount: result.modifiedCount });
        } else {
          res
            .status(404)
            .send({ message: "Order not found or no changes made" });
        }
      } catch (error) {
        console.error("Order Status Update Error:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // বায়ারের নিজস্ব অর্ডার খোঁজার এপিআই
    app.get("/api/v1/orders/my-orders", verifyToken, async (req, res) => {
      const email = req.user.email; // লগইন করা ইউজারের ইমেইল
      // ডাটাবেসে userEmail ফিল্ডের সাথে মেলাতে হবে
      const query = { userEmail: email };
      const result = await ordersCollection.find(query).toArray();
      res.send(result);
    });
    // 2. ✅ অনুমোদিত (Approved) অর্ডারগুলো পাওয়ার রুট
    app.get("/api/v1/orders/approved", verifyToken, async (req, res) => {
      try {
        const email = req.user.email;
        const role = req.user.role?.toLowerCase();

        let query = { status: "approved" };

        // যদি ইউজার ম্যানেজার হয়, তবে শুধু তার নিজের যোগ করা প্রোডাক্টের অর্ডারগুলো দেখবে
        if (role === "manager") {
          query.managerEmail = email;
          // নোট: অর্ডার সেভ করার সময় প্রোডাক্ট যে ম্যানেজারের, তার ইমেইলটি 'managerEmail' ফিল্ডে সেভ থাকতে হবে।
        }

        // অ্যাডমিন হলে উপরের query-তে কোনো পরিবর্তন আসবে না, তাই সে সব দেখতে পাবে।
        const result = await ordersCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching approved orders:", error);
        res.status(500).send({ message: "Error fetching approved orders" });
      }
    });

    // 3. পেন্ডিং অর্ডারগুলো পাওয়া (ম্যানেজার বা অ্যাডমিনের জন্য)
    app.get("/api/v1/orders/pending", verifyToken, async (req, res) => {
      try {
        const email = req.user.email;
        const role = req.user.role?.toLowerCase();

        let query = { status: "pending" };

        // ম্যানেজার হলে শুধু তার প্রোডাক্টির পেন্ডিং অর্ডার দেখবে
        if (role === "manager") {
          query.managerEmail = email;
        }

        const result = await ordersCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching pending orders" });
      }
    });

    // 4. অর্ডার স্ট্যাটাস আপডেট (Approve অথবা Reject)
    // আমরা একটি ডাইনামিক রুট ব্যবহার করছি action (approve/reject) এবং id অনুযায়ী
    app.patch("/api/v1/orders/:action/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const action = req.params.action; // এটি 'approve' অথবা 'reject' হবে

        const filter = { _id: new ObjectId(id) };
        let updatedStatus = "";

        if (action === "approve") {
          updatedStatus = "approved";
        } else if (action === "reject") {
          updatedStatus = "rejected";
        } else {
          return res.status(400).send({ message: "Invalid action" });
        }

        const updateDoc = {
          $set: { status: updatedStatus },
        };

        const result = await ordersCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Status Update Error:", error);
        res.status(500).send({ message: "Failed to update order status" });
      }
    });

    // 5. একটি নির্দিষ্ট অর্ডারের তথ্য ট্র্যাক করার জন্য
    app.get("/api/v1/orders/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;

        // ১. চেক করা আইডিটি মঙ্গোডিবি ফরম্যাটে সঠিক কি না
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid Order ID format" });
        }

        const query = { _id: new ObjectId(id) };

        // ২. ডাটাবেস থেকে অর্ডারটি খোঁজা (ordersCollection আপনার ডিক্লেয়ার করা নাম অনুযায়ী)
        const result = await ordersCollection.findOne(query);

        if (!result) {
          return res.status(404).send({ message: "Order not found" });
        }

        // ৩. সিকিউরিটি চেক: শুধুমাত্র অ্যাডমিন অথবা যে বায়ার অর্ডার করেছেন তিনি দেখতে পারবেন
        // (যদি আপনি আরও কঠোর সিকিউরিটি চান তবে নিচের অংশটি ব্যবহার করুন)
        /*
    if (req.user.role !== 'admin' && req.user.email !== result.userEmail) {
      return res.status(403).send({ message: "Unauthorized access to this order" });
    }
    */

        res.send(result);
      } catch (error) {
        console.error("Order Tracking Error:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

    // Payment Intent তৈরি করার API
    app.post("/api/v1/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100); // সেন্টে রূপান্তর

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    // বুকিং সেভ করার এন্ডপয়েন্ট
    app.post("/api/v1/bookings", async (req, res) => {
      const bookingData = req.body;

      // আপনার বুকিং কালেকশনের নাম এখানে ব্যবহার করুন
      const result = await bookingCollection.insertOne(bookingData);

      res.send(result);
    });
    console.log("Server API is ready");
  } finally {
  }
}

run().catch(console.dir);

/* =====================================================
   7. ROOT
===================================================== */
app.get("/", (req, res) => {
  res.send("Garments Order & Production Tracker API Running");
});

app.listen(port, () => {
  console.log(`Garments Order Tracker Server running on port ${port}`);
});
