const axios = require('axios');

exports.validateToken = async (context, token) => {
    const response = await axios.post(
        `https://iam.twilio.com/v2/Tokens/validate/${context.SSO_REALM_SID}`,
        {
            token,
        },
        {
            headers: {
                "Content-Type": "application/json",
            },
            auth: {
                username: context.ACCOUNT_SID,
                password: context.AUTH_TOKEN
            },
        }
    );
    return { identity: response.data.realm_user_id };
};
