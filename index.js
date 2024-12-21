const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const jwt = require("jsonwebtoken");

const port = process.env.PORT || 4000;
const app = express();

const cookieParser = require("cookie-parser");

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://solospherer.web.app",
    "https://solospherer.firebaseapp.com/",
  ],
  credentials: true,
  optionalSuccessStatus: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.j5yqq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// verify the token
const verifyToken = (req, res, next) => {
  // console.log("Hello i am a middleware");
  const token = req.cookies?.token;
  // console.log(token);

  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized access" });
    }
    req.user = decoded;
  });
  next();
};

async function run() {
  try {
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    const db = client.db("SoloSphereDB");
    const jobsCollection = db.collection("jobs");
    const bidsCollection = db.collection("bids");

    // generate jwt token
    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.SECRET_KEY, {
        expiresIn: "365d",
      });

      console.log(token);
      // res.send(token);
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // logout || clear cookies form browser
    app.get("/logout", async (req, res) => {
      res
        .clearCookie("token", {
          maxAge: 0,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // save a jobData in db
    app.post("/add-job", async (req, res) => {
      const jobData = req.body;
      const result = await jobsCollection.insertOne(jobData);
      console.log(result);
      res.send(result);
    });

    // update a jobData in db
    app.put("/update-job/:id", async (req, res) => {
      const id = req.params.id;
      const jobData = req.body;
      const updatedData = {
        $set: jobData,
      };
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const result = await jobsCollection.updateOne(
        query,
        updatedData,
        options
      );
      console.log(result);
      res.send(result);
    });

    // get all jobData from db
    app.get("/jobs", async (req, res) => {
      const result = await jobsCollection.find().toArray();
      res.send(result);
    });

    // get all jobs posted by specific user
    app.get("/jobs/:email", verifyToken, async (req, res) => {
      //---------------for token security--------------------------
      const email = req.params.email;
      const decodedEmail = req.user?.email;
      // console.log("Email from token: ", decodedEmail);
      // console.log("Email from params: ", email);

      if (decodedEmail !== email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      //----------------------------------------------------------------
      // const email = req.params.email;
      const query = { "buyer.email": email };
      const result = await jobsCollection.find(query).toArray();
      res.send(result);
    });

    // delete a job from db
    app.delete("/job/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.deleteOne(query);
      res.send(result);
    });

    // get a single job data by id from db
    app.get("/job/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      console.log(id);
      const result = await jobsCollection.findOne(query);
      res.send(result);
    });

    // save a bid data in db
    app.post("/add-bid", async (req, res) => {
      const bidData = req.body;
      // 0. checking if a user placed a bid already in this job
      const query = {
        email: bidData.email,
        jobId: bidData.jobId,
      };
      const alreadyExist = await bidsCollection.findOne(query);
      console.log("If already exists", alreadyExist);
      if (alreadyExist) {
        return res.status(400).send("You already have a bid for this job");
      }

      // 1. save data in bids collection
      const result = await bidsCollection.insertOne(bidData);
      // console.log(result);

      // 2. increase bid count for that job in jobs collection
      const filter = { _id: new ObjectId(bidData.jobId) };
      const update = {
        $inc: {
          bid_count: 1,
        },
      };
      const updateCount = await jobsCollection.updateOne(filter, update);
      res.send(result);
    });

    // get all bidded jobs for a specific user
    app.get(`/bids/:email`, verifyToken, async (req, res) => {
      const isBuyer = req.query?.buyer;
      const email = req.params.email;
      const decodedEmail = req.user?.email;
      // console.log("Email from token: ", decodedEmail);
      // console.log("Email from params: ", email);

      if (decodedEmail !== email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      let query = {};
      if (isBuyer) {
        query.buyer = email;
      } else {
        query.email = email;
      }
      const result = await bidsCollection.find(query).toArray();
      res.send(result);
    });

    // get all bid request jobs for a specific user
    // app.get(`/bid-requests/:email`, async (req, res) => {
    //   const email = req.params.email;
    //   const query = { buyer: email };
    //   const result = await bidsCollection.find(query).toArray();
    //   res.send(result);
    // });

    // update bid status
    app.patch("/bid-status-update/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;

      const filter = { _id: new ObjectId(id) };
      const updated = {
        $set: { status },
      };

      const result = await bidsCollection.updateOne(filter, updated);
      res.send(result);
    });

    // get all jobs for all job page
    app.get("/all-jobs", async (req, res) => {
      const filter = req.query.filter;
      const search = req.query.search;
      const sort = req.query.sort;
      let options = {};
      // 1 for ascending and -1 for descending
      if (sort) options = { sort: { deadline: sort === "asc" ? 1 : -1 } };
      let query = {
        title: {
          $regex: search,
          $options: "i",
        },
      };
      if (filter) query.category = filter;
      const results = await jobsCollection.find(query, options).toArray();
      res.send(results);
    });
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);
app.get("/", (req, res) => {
  res.send("Hello from SoloSphere Server....");
});

app.listen(port, () => console.log(`Server running on port ${port}`));
