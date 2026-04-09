import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';

let verifyEnabled = false;

export function initFirebaseAdmin() {
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const jsonPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  try {
    let credObj;
    if (jsonPath) {
      const resolved = path.isAbsolute(jsonPath) ? jsonPath : path.join(process.cwd(), jsonPath);
      credObj = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    } else if (jsonRaw) {
      credObj = JSON.parse(jsonRaw);
    } else {
      const prod = process.env.NODE_ENV === 'production';
      if (prod) {
        console.warn(
          '[API] Sem FIREBASE_SERVICE_ACCOUNT_PATH ou FIREBASE_SERVICE_ACCOUNT_JSON — /api/* não valida token. Configure a conta de serviço na Azure (ou outro host).'
        );
      } else {
        console.info(
          '[API] Modo dev: rotas /api/* sem verificação de token Firebase (normal). Para testar auth na API, defina FIREBASE_SERVICE_ACCOUNT_PATH no .env.'
        );
      }
      return false;
    }
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(credObj) });
    }
    verifyEnabled = true;
    console.log('[API] Verificação de token Firebase ativa.');
    return true;
  } catch (e) {
    console.error('[API] firebase-admin init falhou:', e?.message ?? e);
    return false;
  }
}

export async function requireFirebaseAuth(req, res, next) {
  if (!verifyEnabled) return next();
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  try {
    await admin.auth().verifyIdToken(h.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}
