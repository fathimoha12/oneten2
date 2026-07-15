const handleRequest = require("../../server");

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default function handler(req, res) {
  return handleRequest(req, res);
}
