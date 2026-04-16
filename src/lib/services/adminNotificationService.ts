import { config } from "../config";

export const notifyAdminOfFlaggedSource = async (params: {
  sourceUrl: string;
  sourceId: number;
  reason: string;
}) => {
  if (!config.resendApiKey || !config.resendFrom || !config.adminAlertEmail) {
    return {
      delivered: false,
      reason: "Admin alert skipped: missing Resend or admin email config.",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.resendFrom,
      to: [config.adminAlertEmail],
      subject: `Football Wire source flagged (#${params.sourceId})`,
      html: `<p>A source was flagged during validation.</p>
<p><strong>Source:</strong> ${params.sourceUrl}</p>
<p><strong>Reason:</strong> ${params.reason}</p>`,
    }),
  });

  if (!response.ok) {
    return {
      delivered: false,
      reason: `Resend failed with ${response.status}`,
    };
  }

  return {
    delivered: true,
    reason: "Alert sent.",
  };
};
