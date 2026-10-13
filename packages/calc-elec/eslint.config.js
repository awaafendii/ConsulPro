import { base, pureEngine } from '@consulpro/config-eslint';

export default [...base({ tsconfigRootDir: import.meta.dirname }), ...pureEngine];
