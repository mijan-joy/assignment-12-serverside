const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { ObjectID } = require("bson");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;
// Private repo to public repo
// Middleware
app.use(cors());
app.use(express.json());

// Verifying Token From User
const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorize Access" });
  }

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden Access" });
    }
    req.decoded = decoded;
    next();
  });
};

// Database Connection
const uri = `mongodb+srv://${process.env.dbUser}:${process.env.dbPassword}@cluster0.njw5u.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// Database Operations
async function run() {
  try {
    await client.connect();
    const productCollection = client.db("factory").collection("products");
    const userCollection = client.db("factory").collection("users");
    const orderCollection = client.db("factory").collection("orders");
    const reviewCollection = client.db("factory").collection("reviews");
    const userProfileCollection = client
      .db("tool_planet")
      .collection("profiles");

    // Verify admin
    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;

      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        return res.status(403).send({ message: "Forbidden Access" });
      }
    };

    // Get all products or particular number of products from database (products components)
    app.get("/products", async (req, res) => {
      const dataSize = parseInt(req.query.size);
      if (dataSize) {
        const result = await productCollection
          .find()
          .sort({ _id: -1 })
          .skip(0)
          .limit(dataSize)
          .toArray();
        res.send(result);
      } else {
        const result = await productCollection.find().toArray();
        res.send(result);
      }
    });

    // Save user info on database when user register the app and also give them token whenever they registered or login (useToken component)
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { email };
      const options = { upsert: true };
      const updateDoc = {
        $set: req.body,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      var token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET);
      res.send({ result, token });
    });

    // Get a particular product using ID (Order component)
    app.get("/product/:id", async (req, res) => {
      const result = await productCollection.findOne({
        _id: ObjectId(req.params.id),
      });
      res.send(result);
    });
    // Get all orders (orderForm component)
    app.post("/orders", async (req, res) => {
      const exists = await orderCollection.findOne({
        productId: req.body.productId,
        customerEmail: req.body.customerEmail,
      });
      if (exists)
        return res.send({
          success: false,
          info: "Already booked. Please order other products",
        });
      const result = await orderCollection.insertOne(req.body);
      res.send({ success: true, info: "Order Successful" });
    });
    // Get all orders of particular email (My orders components)
    app.get("/order", verifyJWT, async (req, res) => {
      if (req.query.email === req.decoded.email) {
        const orders = await orderCollection
          .find({ customerEmail: req.query.email })
          .toArray();
        res.send(orders);
      } else {
        return res.status(403).send({ message: "Forbidden Access" });
      }
    });
    // Get orders by particular id (Payment component)
    app.get("/order/:id", verifyJWT, async (req, res) => {
      const result = await orderCollection.findOne({
        _id: ObjectId(req.params.id),
      });
      res.send(result);
    });
    // Delete order using ID (MyOrders Component)
    app.delete("/order/:id", verifyJWT, async (req, res) => {
      const result = await orderCollection.deleteOne({
        _id: ObjectID(req.params.id),
      });
      res.send(result);
    });

    // Post all reviews (AddAReviews component)
    app.post("/reviews", verifyJWT, async (req, res) => {
      const result = await reviewCollection.insertOne(req.body);
      res.send({ success: true, info: "Review Added Successful" });
    });
    // Get all reviews (Home component)
    app.get("/reviews", async (req, res) => {
      const reviews = await reviewCollection.find().toArray();
      res.send(reviews);
    });
    //Post all user profile info (My Profile component)
    app.put("/userprofile", verifyJWT, async (req, res) => {
      const filter = { userEmail: req.body.userEmail };
      const options = { upsert: true };
      const updateDoc = {
        $set: req.body,
      };
      const result = await userProfileCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send({ success: true, info: "Info. Added Successful" });
    });

    // Get user profile info (My Profile component)
    app.get("/userprofile", verifyJWT, async (req, res) => {
      const userInfoExist = await userProfileCollection.findOne({
        userEmail: req.query.userEmail,
      });
      if (userInfoExist) {
        res.send({ userInfo: true, userInfoExist });
      } else {
        res.send({ userInfo: false });
      }
    });
    // Get All users
    app.get("/users", verifyJWT, async (req, res) => {
      const users = await userCollection.find({}).toArray();
      res.send(users);
    });
    // Make admin
    app.put("/user/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    // Get If user is admin or not
    app.get("/user/admin/:email", async (req, res) => {
      const user = await userCollection.findOne({ email: req.params.email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });
    // Post all product (AddAProduct component)
    app.post("/product", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await productCollection.insertOne(req.body);
      res.send({ success: true, info: "Product Added Successful" });
    });

    // Delete products using ID (ManageProducts Component)
    app.delete("/product/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await productCollection.deleteOne({
        _id: ObjectID(req.params.id),
      });
      res.send(result);
    });

    // *******All Payment Related Apis*******
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const service = req.body;
      const price = service.price;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
  } finally {
    //   await client.close();
  }
}
run().catch(console.dir);

// Base API
app.get("/", (req, res) => {
  res.send("Tool Planet Server Running");
});

app.listen(port, () => {
  console.log(`Tool Planet listening on port ${port}`);
});
