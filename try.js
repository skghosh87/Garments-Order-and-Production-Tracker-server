const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// /* ===================== MIDDLEWARE ===================== */
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// /* ===================== MONGODB ===================== */
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// /* ===================== MAIN ===================== */
async function run() {
  try {
    await client.connect();
    const db = client.db("garmentsTrackerDB");

//     const usersCollection = db.collection("users");
//     const productsCollection = db.collection("products");
//     const ordersCollection = db.collection("orders");
//     const trackingCollection = db.collection("tracking");

    console.log("✅ Database Connected Successfully!");

//     // /* ===================== JWT MIDDLEWARE ===================== */
//     // // মিডলওয়্যারগুলো run() এর ভেতরে রাখা হয়েছে যেন কালেকশনগুলো এক্সেস করা যায়
//     // const verifyJWT = (req, res, next) => {
//     //   const token = req.cookies?.token;
//     //   if (!token) return res.status(401).send({ message: "Unauthorized" });

//     //   jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
//     //     if (err) return res.status(403).send({ message: "Forbidden" });
//     //     req.user = decoded;
//     //     next();
//     //   });
//     // };

//     // const verifyAdmin = async (req, res, next) => {
//     //   const user = await usersCollection.findOne({ email: req.user.email });
//     //   if (!user || user.role !== "admin")
//     //     return res.status(403).send({ message: "Admin only" });
//     //   if (user.status === "suspended")
//     //     return res.status(403).send({ message: "Account suspended" });
//     //   next();
//     // };

//     // const verifyManager = async (req, res, next) => {
//     //   const user = await usersCollection.findOne({ email: req.user.email });
//     //   if (!user || user.role !== "manager")
//     //     return res.status(403).send({ message: "Manager only" });
//     //   if (user.status === "suspended")
//     //     return res.status(403).send({ message: "Account suspended" });
//     //   next();
//     // };

//     // /* ================= AUTH ================= */
//     // app.post("/api/v1/auth/jwt", async (req, res) => {
//     //   const { email } = req.body;
//     //   const user = await usersCollection.findOne({ email });

//     //   const token = jwt.sign(
//     //     { email, role: user?.role || "buyer" },
//     //     process.env.ACCESS_TOKEN_SECRET,
//     //     { expiresIn: "7d" }
//     //   );

//     //   res
//     //     .cookie("token", token, {
//     //       httpOnly: true,
//     //       secure: process.env.NODE_ENV === "production",
//     //       sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
//     //     })
//     //     .send({ success: true });
//     // });

//     // app.post("/api/v1/auth/logout", (req, res) => {
//     //   res
//     //     .clearCookie("token", {
//     //       httpOnly: true,
//     //       secure: process.env.NODE_ENV === "production",
//     //       sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
//     //     })
//     //     .send({ success: true });
//     // });

//     // /* ================= USERS ================= */
//     // app.post("/api/v1/users", async (req, res) => {
//     //   const exists = await usersCollection.findOne({ email: req.body.email });
//     //   if (exists) return res.send({ message: "User already exists" });

//     //   const user = {
//     //     ...req.body,
//     //     role: "buyer",
//     //     status: "pending",
//     //     suspendReason: "",
//     //     suspendFeedback: "",
//     //     createdAt: new Date(),
//     //   };
//     //   res.send(await usersCollection.insertOne(user));
//     // });

//     // app.get("/api/v1/users", verifyJWT, verifyAdmin, async (req, res) => {
//     //   res.send(await usersCollection.find().toArray());
//     // });

//     // app.patch(
//     //   "/api/v1/users/role/:id",
//     //   verifyJWT,
//     //   verifyAdmin,
//     //   async (req, res) => {
//     //     res.send(
//     //       await usersCollection.updateOne(
//     //         { _id: new ObjectId(req.params.id) },
//     //         { $set: { role: req.body.role } }
//     //       )
//     //     );
//     //   }
//     // );

//     // app.patch(
//     //   "/api/v1/users/suspend/:id",
//     //   verifyJWT,
//     //   verifyAdmin,
//     //   async (req, res) => {
//     //     res.send(
//     //       await usersCollection.updateOne(
//     //         { _id: new ObjectId(req.params.id) },
//     //         {
//     //           $set: {
//     //             status: "suspended",
//     //             suspendReason: req.body.reason,
//     //             suspendFeedback: req.body.feedback,
//     //           },
//     //         }
//     //       )
//     //     );
//     //   }
//     // );

//     // /* ================= PRODUCTS ================= */
//     // app.post("/api/v1/products", verifyJWT, verifyManager, async (req, res) => {
//     //   const product = {
//     //     ...req.body,
//     //     price: Number(req.body.price),
//     //     quantity: Number(req.body.quantity),
//     //     minOrderQty: Number(req.body.minOrderQty),
//     //     createdBy: req.user.email,
//     //     createdAt: new Date(),
//     //   };
//     //   res.send(await productsCollection.insertOne(product));
//     // });

//     // app.get("/api/v1/products", async (req, res) => {
//     //   const page = Number(req.query.page) || 1;
//     //   const limit = Number(req.query.limit) || 10;
//     //   const skip = (page - 1) * limit;

//     //   const products = await productsCollection
//     //     .find()
//     //     .skip(skip)
//     //     .limit(limit)
//     //     .toArray();
//     //   res.send(products);
//     // });

//     // /* ================= ORDERS ================= */
//     // app.post("/api/v1/orders", verifyJWT, async (req, res) => {
//     //   const product = await productsCollection.findOne({
//     //     _id: new ObjectId(req.body.productId),
//     //   });

//     //   if (!product)
//     //     return res.status(404).send({ message: "Product not found" });

//     //   if (req.body.quantity < product.minOrderQty)
//     //     return res
//     //       .status(400)
//     //       .send({ message: "Below minimum order quantity" });

//     //   if (req.body.quantity > product.quantity)
//     //     return res.status(400).send({ message: "Insufficient stock" });

//     //   const order = {
//     //     ...req.body,
//     //     buyerEmail: req.user.email,
//     //     status: "pending",
//     //     createdAt: new Date(),
//     //   };

//     //   res.send(await ordersCollection.insertOne(order));
//     // });

//     // app.get("/api/v1/orders/my", verifyJWT, async (req, res) => {
//     //   res.send(
//     //     await ordersCollection.find({ buyerEmail: req.user.email }).toArray()
//     //   );
//     // });

//     // /* ================= TRACKING ================= */
//     // app.post(
//     //   "/api/v1/tracking/:orderId",
//     //   verifyJWT,
//     //   verifyManager,
//     //   async (req, res) => {
//     //     res.send(
//     //       await trackingCollection.updateOne(
//     //         { orderId: req.params.orderId },
//     //         {
//     //           $push: {
//     //             steps: {
//     //               ...req.body,
//     //               time: new Date(),
//     //             },
//     //           },
//     //         },
//     //         { upsert: true }
//     //       )
//     //     );
//     //   }
//     // );

//     // app.get("/api/v1/tracking/:orderId", verifyJWT, async (req, res) => {
//     //   res.send(
//     //     await trackingCollection.findOne({ orderId: req.params.orderId })
//     //   );
//     // });

    app.get("/", (req, res) => res.send("🚀 Garments Tracker API Running"));
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
  }
}

// run ফাংশন কল করা এবং এরর হ্যান্ডেল করা
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Social Development Events Server is Running!");
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
