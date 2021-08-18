const axios = require('axios');

exports.handler = async function (context, event, callback) {
    let response = new Twilio.Response();
    response.appendHeader('Content-Type', 'application/json');
    try {
        const tokenInfo = await validateToken(context, event.Token);
        console.log('Frontline token user identity: ' + tokenInfo.identity);
        if (tokenInfo.identity === event.Worker) {
            switch (event.location) {
                case 'GetProxyAddress': {
                    if (event.Channel.type === 'whatsapp') {
                        response.setBody({
                            proxy_address: context.WHATSAPP_NUMBER
                        });
                    } else {
                        response.setBody({
                            proxy_address: context.SMS_NUMBER
                        })
                    }
                    break;
                }
                default: {
                    console.log('Unknown location: ', event.location);
                    response.setStatusCode(422);
                }
            }
            return callback(null, response);
        } else {
            console.error(`Worker in request ${event.Worker} 
                and token ${tokenInfo.identity} mismatch`);
            response.setBody('Authorization failed');
            response.setStatusCode(403);
        }
    } catch (e) {
        console.error(e);
        response.setStatusCode(500);
        return callback(null, response);
    }
};

const validateToken = async (context, token) => {
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