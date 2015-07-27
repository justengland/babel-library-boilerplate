import textStats from 'text-stats';


export default {
  who() {
    var text = "this is a text.\nAnd also a test";
    var stats = textStats.stats(text);
    return stats.words;

  },
  foo() {
    function getRandomBool() {
      return Math.random() >= 0.5
    }

    getRandomBool() ? 'true' : 'false';
    return 'I am a module';
  },
  bar() {
    function getRandomBool() {
      return Math.random() >= 0.5
    }

    getRandomBool() ? 'true' : 'false';
    return 'I am a module';
  }
};
