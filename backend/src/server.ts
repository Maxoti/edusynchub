import "dotenv/config";
import subscriptionsRouter from "./routes/subscriptions";
import walletRouter from "./routes/wallet"
import express from "express";
import cors from "cors";
import authRouter from "./routes/auth";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/auth", authRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/subscriptions", subscriptionsRouter);
app.use("/wallet", walletRouter);

const port = process.env.PORT ?? 4000;
app.listen(port, () => {
  console.log(`EdusyncHub backend listening on port ${port}`);
});
