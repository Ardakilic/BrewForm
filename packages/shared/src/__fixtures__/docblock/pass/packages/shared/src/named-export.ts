/** Documented local, exported through a local `export { … }` list. */
const localThing = 'local';

/** Documented local, renamed on export. */
const renamedThing = 'renamed';

export { localThing, renamedThing as publicThing };
