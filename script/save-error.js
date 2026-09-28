export const getSaveErrorMessage = (result = {}, fallback = "Save failed") => {
  let details = result?.details;
  if (typeof details === "string") {
    try {
      details = JSON.parse(details);
    } catch {
      details = { message: details };
    }
  }
  if (String(details?.status) === "401" || details?.message === "Bad credentials") {
    return "GitHub credential rejected. Update GITHUB_TOKEN in Vercel and redeploy.";
  }
  return result?.error || details?.message || fallback;
};
