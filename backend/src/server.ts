import "dotenv/config";
import express from "express";
import cors from "cors";
import authRouter from "./routes/auth";
import subscriptionsRouter from "./routes/subscriptions";
import papersRouter from "./routes/papers";
import purchasesRouter from "./routes/purchases";
import walletRouter from "./routes/wallet";
import webhooksRouter from "./routes/webhooks";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/auth", authRouter);
app.use("/subscriptions", subscriptionsRouter);
app.use("/papers", papersRouter);
app.use("/papers", purchasesRouter);
app.use("/wallet", walletRouter);
app.use("/webhooks", webhooksRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT ?? 4000;
app.listen(port, () => {
  console.log(`EdusyncHub backend listening on port ${port}`);
});
