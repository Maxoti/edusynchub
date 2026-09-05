import { Router } from "express";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription";
import { getPresignedUploadUrl } from "../lib/r2";

const router = Router();

router.post("/presign", requireAuth, requireActiveSubscription, async (req: AuthedRequest, res) => {
  const { fileName, fileType } = req.body ?? {};

  if (!fileName || !fileType) {
    return res.status(400).json({ error: "fileName and fileType are required" });
  }

  try {
    const { uploadUrl, fileKey } = await getPresignedUploadUrl(
      req.teacherId!,
      fileName,
      fileType
    );
    return res.json({ uploadUrl, fileKey });
  } catch (err) {
    console.error("Presign failed:", err);
    return res.status(502).json({ error: "Could not generate upload URL" });
  }
});



export default router;
