// Boston Book Club: connects the page to Firebase (Firestore + Auth).
// Exposes the same small interface the page used on Claude: claude.use("db" | "user" | "assets").
(function () {
  const CONFIG = {
    apiKey: "AIzaSyBB5N-ZLS-1XPmaH68sngof-jNrKABZxG0",
    authDomain: "boston-book-club.firebaseapp.com",
    projectId: "boston-book-club",
    storageBucket: "boston-book-club.firebasestorage.app",
    messagingSenderId: "1039214667173",
    appId: "1:1039214667173:web:20d4f321d3639f22cfb44c"
  };
  // Google accounts that get the organizer controls. Must match firestore.rules.
  const ORGANIZERS = ["tobias.fabricius@gmail.com"];
  const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";

  const ready = (async () => {
    const [appMod, fs, au] = await Promise.all([
      import(SDK + "firebase-app.js"),
      import(SDK + "firebase-firestore.js"),
      import(SDK + "firebase-auth.js")
    ]);
    const app = appMod.initializeApp(CONFIG);
    const db = fs.initializeFirestore(app, { ignoreUndefinedProperties: true });
    const auth = au.getAuth(app);
    await new Promise(res => { const un = au.onAuthStateChanged(auth, () => { un(); res(); }); });
    if (!auth.currentUser) await au.signInAnonymously(auth);
    return { fs, au, db, auth };
  })();
  ready.catch(err => console.error("Firebase failed to start", err));

  const isOrganizer = (F) => {
    const u = F.auth.currentUser;
    return !!(u && !u.isAnonymous && u.email && u.emailVerified && ORGANIZERS.includes(u.email.toLowerCase()));
  };
  const mapErr = (e) => ({ code: e && e.code === "permission-denied" ? "permission_denied" : (e && e.code) || "unavailable", message: (e && e.message) || "" });
  const wrapDoc = (s) => ({ id: s.id, exists: s.exists(), data: () => s.data(), metadata: s.metadata });
  const wrapQuery = (s) => ({ docs: s.docs.map(wrapDoc), size: s.size, empty: s.empty, docChanges: () => s.docChanges(), metadata: s.metadata });
  const wrapErr = (p) => p.catch(e => { throw mapErr(e); });

  function mkDoc(F, ref) {
    return {
      id: ref.id, path: ref.path,
      get: async () => wrapDoc(await wrapErr(F.fs.getDoc(ref))),
      set: (d) => wrapErr(F.fs.setDoc(ref, d)),
      update: (d) => wrapErr(F.fs.setDoc(ref, d, { merge: true })),
      delete: () => wrapErr(F.fs.deleteDoc(ref)),
      onSnapshot: (next, err) => F.fs.onSnapshot(ref, s => next(wrapDoc(s)), e => err && err(mapErr(e))),
      collection: (p) => mkColl(F, F.fs.collection(ref, p))
    };
  }
  function mkColl(F, col) {
    return {
      path: col.path,
      doc: (id) => mkDoc(F, id ? F.fs.doc(col, id) : F.fs.doc(col)),
      add: async (d) => mkDoc(F, await wrapErr(F.fs.addDoc(col, d))),
      get: async () => wrapQuery(await wrapErr(F.fs.getDocs(col))),
      onSnapshot: (next, err) => F.fs.onSnapshot(col, s => next(wrapQuery(s)), e => err && err(mapErr(e)))
    };
  }

  async function use(name) {
    let F;
    try { F = await ready; } catch (e) { return null; }
    if (name === "db") return { doc: (p) => mkDoc(F, F.fs.doc(F.db, p)), collection: (p) => mkColl(F, F.fs.collection(F.db, p)) };
    if (name === "user") return {
      isOwner: async () => isOrganizer(F),
      canEdit: async () => isOrganizer(F),
      can: async () => true,
      id: async () => F.auth.currentUser ? F.auth.currentUser.uid : null
    };
    if (name === "assets") {
      if (!isOrganizer(F)) return null;
      return {
        upload: async (blob) => {
          const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
          if (data.length > 900000) throw { code: "too_large", message: "Image too large" };
          const ref = await wrapErr(F.fs.addDoc(F.fs.collection(F.db, "covers"), { data, createdAt: Date.now() }));
          return { id: ref.id, url: data };
        }
      };
    }
    return null;
  }

  // Organizer sign-in (Google). Members never need to sign in.
  async function signIn() {
    const F = await ready;
    const provider = new F.au.GoogleAuthProvider();
    try { await F.au.signInWithPopup(F.auth, provider); }
    catch (e) {
      if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) return F.au.signInWithRedirect(F.auth, provider);
      throw e;
    }
    location.reload();
  }
  async function signOut() { const F = await ready; await F.au.signOut(F.auth); location.reload(); }
  async function whoAmI() {
    const F = await ready; const u = F.auth.currentUser;
    return { organizer: isOrganizer(F), email: u && !u.isAnonymous ? u.email : null };
  }

  // One-time import of the shelf exported from the Claude version.
  async function importShelf(data) {
    const F = await ready;
    if (!isOrganizer(F)) throw new Error("Sign in as organizer first.");
    const writes = [];
    for (const [id, d] of Object.entries(data.covers || {})) writes.push(["covers/" + id, d]);
    for (const [id, d] of Object.entries(data.books || {})) writes.push(["books/" + id, d]);
    for (const [id, d] of Object.entries(data.club || {})) writes.push(["club/" + id, d]);
    // Small batches keep each request well under Firestore's size limit.
    for (let i = 0; i < writes.length; i += 8) {
      const b = F.fs.writeBatch(F.db);
      for (const [p, d] of writes.slice(i, i + 8)) b.set(F.fs.doc(F.db, p), d);
      await b.commit();
    }
    return writes.length;
  }

  window.claude = { use };
  window.bbc = { signIn, signOut, whoAmI, importShelf };
})();
