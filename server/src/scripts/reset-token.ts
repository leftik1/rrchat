import { regeneratePlainToken, loadConfig } from '../config.js';
import { revokeAllSessions } from '../auth.js';

const newToken = regeneratePlainToken();
revokeAllSessions();
const { config } = loadConfig();

console.log('\n======================================================');
console.log(' Access Token Reset');
console.log('======================================================');
console.log(` New Access Token:  ${newToken}`);
console.log(` Web UI on PC:      http://localhost:${config.port}/#token=${newToken}`);
console.log(' All active sessions have been revoked.');
console.log('======================================================\n');
