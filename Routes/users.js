const express = require("express");
const router = express.Router();

// কালেকশন রেফারেন্স পাস করার জন্য একটি ফাংশন এক্সপোর্ট করা হলো
const usersRouter = (usersCollection) => {
  // রোল এবং স্ট্যাটাস ফেচ করার API (ক্লায়েন্ট সাইড AuthProvider এর জন্য)
  router.get("/role/:email", async (req, res) => {
    const email = req.params.email;
    // এখানে ইউজারকে ডেটাবেস থেকে খুঁজে তার রোল ও স্ট্যাটাস রিটার্ন করার লজিক লিখতে হবে

    const user = await usersCollection.findOne({ email });

    if (!user) {
      return res.status(404).send({ role: "unknown", status: "not_found" });
    }

    res.send({ role: user.role, status: user.status });
  });

  // অন্যান্য ইউজার ম্যানেজমেন্ট এবং রেজিস্ট্রেশন লজিক এখানে যোগ করতে হবে

  return router;
};

module.exports = usersRouter;
