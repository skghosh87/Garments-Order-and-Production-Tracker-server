const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// *******************
// 1. Middlewares
// *******************
app.use(
  cors({
    origin: ["http://localhost:5173", "https://your-garments-tracker.web.app"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// *******************
// 2. MongoDB Connection
// *******************
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
    const database = client.db("garmentsTrackerDB");
    const usersCollection = database.collection("users");
    const productsCollection = database.collection("products");
    const ordersCollection = database.collection("orders");
    const messagesCollection = database.collection("messages");

    // ==========================================
    // 3. Auth & JWT
    // ==========================================

    app.post("/api/v1/auth/jwt", async (req, res) => {
      const user = req.body;
      const userData = await usersCollection.findOne({ email: user.email });
      const payload = { email: user.email, role: userData?.role || "Buyer" };
      const token = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        })
        .send({ success: true, role: payload.role });
    });

    app.post("/api/v1/auth/logout", (req, res) => {
      res
        .clearCookie("token", { maxAge: 0, sameSite: "none", secure: true })
        .send({ success: true });
    });

    const verifyToken = (req, res, next) => {
      const token = req?.cookies?.token;
      if (!token)
        return res.status(401).send({ message: "Unauthorized access" });
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err)
          return res.status(401).send({ message: "Unauthorized access" });
        req.user = decoded;
        next();
      });
    };

    app.get("/api/v1/users/role/:email", async (req, res) => {
      try {
        const email = req.params.email;

        if (!email || email === "undefined")
          return res.status(400).send({ message: "Invalid Email" });
        const user = await usersCollection.findOne({ email });

        // যদি ইউজার ডাটাবেসে না থাকে, তবে ডিফল্ট হিসেবে Buyer পাঠানো হবে
        if (!user) {
          return res.send({ role: "Buyer", status: "verified" });
        }

        res.send({ role: user.role, status: user.status });
      } catch (error) {
        console.error("Role Fetch Error:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // ==========================================
    // 4. Product APIs (Home Page & All Products)
    // ==========================================
    // নতুন প্রোডাক্ট যোগ করার এপিআই (অ্যাডমিন বা ম্যানেজার)
    app.post("/api/v1/products", verifyToken, async (req, res) => {
      try {
        const product = req.body;

        // সার্ভার সাইড সিকিউরিটি চেক: শুধু ম্যানেজার বা অ্যাডমিন প্রোডাক্ট যোগ করতে পারবে
        if (req.user.role !== "Manager" && req.user.role !== "Admin") {
          return res.status(403).send({ message: "Forbidden Access" });
        }

        const result = await productsCollection.insertOne(product);
        res.send(result);
      } catch (error) {
        console.error("Add Product Error:", error);
        res.status(500).send({ message: "Failed to add product" });
      }
    });
    app.get("/api/v1/products", async (req, res) => {
      try {
        const { search, category, limit } = req.query; // limit প্যারামিটার যোগ করা হয়েছে
        let query = {};

        if (search) query.name = { $regex: search, $options: "i" };
        if (category) query.category = category;

        // যদি হোম পেজ থেকে limit=6 পাঠানো হয়, তবে শুধু ৬টি ডাটা যাবে
        const cursor = productsCollection.find(query);
        if (limit) {
          cursor.limit(parseInt(limit));
        }

        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch products" });
      }
    });

    app.get("/api/v1/products/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await productsCollection.findOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        res.status(400).send({ message: "Invalid product ID" });
      }
    });
    // ১. প্রোডাক্ট ডিলিট করার এপিআই
    app.delete("/api/v1/products/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        // সিকিউরিটি: চেক করা যে ডিলিট রিকোয়েস্টটি কি মালিক বা অ্যাডমিন পাঠিয়েছে কি না
        const product = await productsCollection.findOne(query);
        if (req.user.role !== "Admin" && product.addedBy !== req.user.email) {
          return res.status(403).send({ message: "Forbidden Access" });
        }

        const result = await productsCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Delete failed" });
      }
    });

    // ২. প্রোডাক্ট আপডেট করার এপিআই
    app.put("/api/v1/products/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedProduct = req.body;

        // সিকিউরিটি চেক
        const product = await productsCollection.findOne(filter);
        if (req.user.role !== "Admin" && product.addedBy !== req.user.email) {
          return res.status(403).send({ message: "Forbidden Access" });
        }

        const updateDoc = {
          $set: {
            name: updatedProduct.name,
            price: updatedProduct.price,
            category: updatedProduct.category,
            description: updatedProduct.description,
            image: updatedProduct.image,
          },
        };

        const result = await productsCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Update failed" });
      }
    });
    // ==========================================
    // 5. Orders & Messages
    // ==========================================

    app.post("/api/v1/orders", verifyToken, async (req, res) => {
      const order = req.body;
      const orderDoc = {
        ...order,
        status: "pending",
        orderDate: new Date(),
        trackingHistory: [
          { status: "Order Placed", time: new Date(), location: "System" },
        ],
      };
      const result = await ordersCollection.insertOne(orderDoc);

      const filter = { _id: new ObjectId(order.productId) };
      const updateDoc = { $inc: { quantity: -order.orderQuantity } };
      await productsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    // ম্যানেজার শুধুমাত্র তার নিজের প্রোডাক্টের এপ্রুভড অর্ডারগুলো দেখবে
    app.get("/api/v1/orders/approved", verifyToken, async (req, res) => {
      try {
        const managerEmail = req.user.email; // JWT টোকেন থেকে ম্যানেজারের ইমেইল

        // Aggregation pipeline ব্যবহার করে ডাটা ফিল্টার করা
        const result = await ordersCollection
          .aggregate([
            {
              // ১.productId-কে ObjectId-তে রূপান্তর (প্রয়োজন হলে)
              $addFields: {
                convertedProductId: { $toObjectId: "$productId" },
              },
            },
            {
              // ২. products কালেকশনের সাথে জয়েন করা
              $lookup: {
                from: "products",
                localField: "convertedProductId",
                foreignField: "_id",
                as: "productDetails",
              },
            },
            { $unwind: "$productDetails" }, // অ্যারে থেকে অবজেক্টে রূপান্তর
            {
              // ৩. ফিল্টার: স্ট্যাটাস 'approved' এবং প্রোডাক্টটি এই ম্যানেজারের যোগ করা
              $match: {
                status: "approved",
                "productDetails.addedBy": managerEmail,
              },
            },
            {
              // ৪. শুধুমাত্র প্রয়োজনীয় ডেটাগুলো পাঠানো (অপ্রয়োজনীয় ফিল্ড বাদ দেওয়া)
              $project: {
                productDetails: 0,
                convertedProductId: 0,
              },
            },
          ])
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Manager Approved Orders Error:", error);
        res
          .status(500)
          .send({ message: "Failed to fetch your approved orders" });
      }
    });

    // ১. ম্যানেজারের নিজস্ব প্রোডাক্টের পেন্ডিং অর্ডারগুলো পাওয়ার এপিআই
    app.get("/api/v1/orders/pending", verifyToken, async (req, res) => {
      try {
        const managerEmail = req.user.email;
        const result = await ordersCollection
          .aggregate([
            {
              $addFields: { convertedProductId: { $toObjectId: "$productId" } },
            },
            {
              $lookup: {
                from: "products",
                localField: "convertedProductId",
                foreignField: "_id",
                as: "productDetails",
              },
            },
            { $unwind: "$productDetails" },
            {
              $match: {
                status: "pending",
                "productDetails.addedBy": managerEmail,
              },
            },
            { $project: { productDetails: 0, convertedProductId: 0 } },
          ])
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch pending orders" });
      }
    });

    // ২. অর্ডার এপ্রুভ বা রিজেক্ট করার প্যাচ (PATCH) এপিআই
    app.patch("/api/v1/orders/:action/:id", verifyToken, async (req, res) => {
      try {
        const { action, id } = req.params;
        const filter = { _id: new ObjectId(id) };

        // একশন অনুযায়ী স্ট্যাটাস নির্ধারণ
        let newStatus = action === "approve" ? "approved" : "rejected";

        const updateDoc = {
          $set: { status: newStatus },
          $push: {
            trackingHistory: {
              status: `Order ${newStatus}`,
              time: new Date(),
              updatedBy: req.user.email,
            },
          },
        };

        const result = await ordersCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Action failed" });
      }
    });
    app.post("/api/v1/contact", async (req, res) => {
      const message = req.body;
      const result = await messagesCollection.insertOne({
        ...message,
        submittedAt: new Date(),
      });
      res.send(result);
    });
    // ১. লগইন থাকা বায়ারের নিজস্ব অর্ডারগুলো পাওয়ার এপিআই
    app.get("/api/v1/orders/my-orders", verifyToken, async (req, res) => {
      const email = req.user.email;
      const query = { buyerEmail: email };
      const result = await ordersCollection.find(query).toArray();
      res.send(result);
    });

    // ২. বায়ারের অর্ডার ক্যান্সেল করার এপিআই (যদি স্ট্যাটাস pending থাকে)
    app.patch("/api/v1/orders/cancel/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id), status: "pending" }; // সিকিউরিটি: শুধু pending অর্ডারই ক্যান্সেল হবে
      const updateDoc = {
        $set: { status: "rejected" }, // বা 'cancelled' স্ট্যাটাস ব্যবহার করতে পারেন
      };
      const result = await ordersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    // ১. ইউজারদের লিস্ট পাওয়ার এপিআই (সার্চ, ফিল্টার ও পেজিনেশন সহ)
    app.get("/api/v1/users", verifyToken, verifyAdmin, async (req, res) => {
      const { search, role, page, limit } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      let query = {};
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }
      if (role && role !== "all") {
        query.role = role;
      }

      const users = await usersCollection
        .find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();
      const totalUsers = await usersCollection.countDocuments(query);
      const totalPages = Math.ceil(totalUsers / parseInt(limit));

      res.send({ users, totalPages });
    });

    // ২. রোল এবং স্ট্যাটাস আপডেটের জন্য প্যাচ এপিআই
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
        const { status, reason, feedback } = req.body;
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          {
            $set: {
              status,
              suspensionReason: reason,
              suspensionFeedback: feedback,
            },
          }
        );
        res.send(result);
      }
    );
    // সব অর্ডার পাওয়ার এপিআই (শুধু অ্যাডমিনের জন্য)
    app.get("/api/v1/orders", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await ordersCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Server error" });
      }
    });
    // Registration/User Save
    app.post("/api/v1/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser)
        return res.send({ message: "User exists", insertedId: null });
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    console.log("MongoDB connected and API endpoints ready!");
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => res.send("Garments Tracker API is running"));
app.listen(port, () => console.log(`Server is running on port: ${port}`));
