module.exports = {
  rules: {
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
    'header-max-length': [2, 'always', 72],
  },
  parserOpts: {
    // Allow "#10193 refactor: ..." — parse #<number> as optional ticket prefix
    headerPattern: /^((?:\[?[A-Z]+\]?\s+)?#\d+\s+)?(\w+)(?:\(([^)]+)\))?!?:\s+(.+)$/,
    headerCorrespondence: ['ticket', 'type', 'scope', 'subject'],
  },
};
