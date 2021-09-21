const jwt = require('jsonwebtoken');
const jsforce = require('jsforce');
const axios = require('axios');
var querystring = require('querystring');

exports.sfdcAuthenticate = async (context) => {
    const threeMinutesFromNowInSeconds = Math.floor(Date.now() / 1000) + 3 * 60;
    const claim = {
        iss: context.SF_CONSUMER_KEY,
        aud: 'https://login.salesforce.com',
        prn: context.SF_USERNAME,
        exp: threeMinutesFromNowInSeconds
    };
    const openKey = Runtime.getAssets()['/server.key'].open;
    const key = openKey();
    const jwtToken = jwt.sign(claim, key, { algorithm: 'RS256' });
    const params = {
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwtToken
    };
    try {
        const response = await axios.post(
            'https://login.salesforce.com/services/oauth2/token',
            querystring.stringify(params),
        );
        const credentials = response.data;
        const sfdcConn = new jsforce.Connection({
            accessToken: credentials.access_token,
            instanceUrl: credentials.instance_url
        });
        return sfdcConn;
    } catch (e) {
        console.error(e);
    }
};
