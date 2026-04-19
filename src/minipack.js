/**
 * 모듈 번들러는 작은 코드 조각들을 웹에서 작동할 수 있는 큰 복잡한 코드로 변환합니다.
 * 작은 조각들은 단순한 JavaScript 파일들이며, 이들의 의존성은 모듈 시스템으로 표현됩니다.
 * (https://webpack.js.org/concepts/modules).
 *
 * 모듈 번들러는 entry file이라는 개념을 가지고 있습니다.
 * 브라우저에 몇 개의 스크립트 태그를 추가하고실행하는 대신,
 * 번들러에게 어느 파일이 애플리케이션의 메인 파일인지 알려줍니다.
 * 이 파일은 전체 애플리케이션을 부트스트랩하는 파일입니다.
 *
 * 번들러는 entry file에서 시작하여 의존하는 파일들을 이해하려고 합니다.
 * 그런 다음, 그 파일들이 의존하는 파일들을 이해하려고 합니다.
 * 애플리케이션의 모든 모듈들이 서로 어떻게 의존하는지 파악할 때까지 계속해서 수행합니다.
 *
 * 프로젝트에 대한 이해를 dependency graph라고 합니다.
 *
 * 예를 들어, 우리는 dependency graph를 만들어 모든 모듈을 하나의 번들로 패키징하는데 사용할 예정입니다.
 *
 * 시작해봅시다 :)
 *
 * 참고: 이 예제는 매우 단순한 예제입니다. 예제를 가능한 간단하게 만들기 위해서
 * circular dependencies, caching module exports, parsing each module just once
 * 등의 경우는 생략했습니다.
 */

const fs = require("fs");
const path = require("path");
const babylon = require("babylon");
const traverse = require("babel-traverse").default;
const { transformFromAst } = require("babel-core");

let ID = 0;

// 파일 경로를 받아 파일 내용을 읽고, 의존하는 파일들을 추출하는 함수를 만듭니다.
function createAsset(filename) {
  // 파일 내용을 문자열로 읽습니다.
  const content = fs.readFileSync(filename, "utf-8");

  // 어느 파일들이 이 파일에 의존하는지 알아내기 위해, import 문자열의 내용들을 찾아봅니다.
  // 이 방법은 투박한 방법이므로, 대신에 JavaScript 파서를 사용할 것입니다.
  //
  // JavaScript 파서는 JavaScript 코드를 읽고 이해할 수 있는 도구입니다.
  // 이들은 AST(abstract syntax tree)라고 하는 더 추상적인 모델을 생성합니다.

  // AST Explorer(https://astexplorer.net)를 참고하여 AST가 어떻게 생겼는지 확인해보세요.
  //
  // AST는 우리의 코드에 대한 많은 정보를 포함합니다.
  // 우리는 이를 쿼리하여 코드가 무엇을 시도하려고 하는지 이해할 수 있습니다.
  const ast = babylon.parse(content, {
    sourceType: "module",
  });

  // 이 배열은 이 모듈이 의존하고 있는 모듈들의 상대 경로를 저장합니다.
  const dependencies = [];

  // 우리는 AST를 순회하여 이 모듈이 의존하는 모듈들을 알아내려고 합니다.
  // 이를 위해, 우리는 AST에서 모든 import 선언을 확인합니다.
  traverse(ast, {
    // EcmaScript 모듈들은 정적이기에 상대적으로 쉽습니다.
    // 변수를 import할 수 없거나 조건적으로 다른 모듈을 import할 수 없음을 의미합니다.
    // import 구문을 볼 때마다 우리는 그 값들을 의존성으로 간주할 수 있습니다.
    ImportDeclaration: ({ node }) => {
      // 우리는 의존성 배열에 우리가 import한 값을 넣습니다.
      dependencies.push(node.source.value);
    },
  });

  // 우리는 간단히 증가하는 카운터를 이 모듈에 고유한 식별자로 할당합니다.
  const id = ID++;

  // We use EcmaScript modules and other JavaScript features that may not be
  // supported on all browsers. To make sure our bundle runs in all browsers we
  // will transpile it with Babel (see https://babeljs.io).
  // 우리는 모든 브라우저에서 지원하지 않을 수 있는 EcmaScript 모듈들과 다른 JavaScript 기능들을 사용합니다.
  // 이를 위해, 우리는 Babel을 사용하여 트랜스파일합니다. (https://babeljs.io)
  //
  // `presets` 옵션은 Babel이 우리의 코드를 트랜스파일하는 방법을 알려주는 규칙들의 집합입니다.
  // 우리는 `babel-preset-env`를 사용하여 대부분의 브라우저에서 실행할 수 있는 코드로 트랜스파일합니다.
  const { code } = transformFromAst(ast, null, {
    presets: ["env"],
  });

  // 이 모듈에 대한 모든 정보를 반환합니다.
  return {
    id,
    filename,
    dependencies,
    code,
  };
}

// Now that we can extract the dependencies of a single module, we are going to
// start by extracting the dependencies of the entry file.
//
// Then, we are going to extract the dependencies of every one of its
// dependencies. We will keep that going until we figure out about every module
// in the application and how they depend on one another. This understanding of
// a project is called the dependency graph.
function createGraph(entry) {
  // Start by parsing the entry file.
  const mainAsset = createAsset(entry);

  // We're going to use a queue to parse the dependencies of every asset. To do
  // that we are defining an array with just the entry asset.
  const queue = [mainAsset];

  // We use a `for ... of` loop to iterate over the queue. Initially the queue
  // only has one asset but as we iterate it we will push additional new assets
  // into the queue. This loop will terminate when the queue is empty.
  for (const asset of queue) {
    // Every one of our assets has a list of relative paths to the modules it
    // depends on. We are going to iterate over them, parse them with our
    // `createAsset()` function, and track the dependencies this module has in
    // this object.
    asset.mapping = {};

    // This is the directory this module is in.
    const dirname = path.dirname(asset.filename);

    // We iterate over the list of relative paths to its dependencies.
    asset.dependencies.forEach((relativePath) => {
      // Our `createAsset()` function expects an absolute filename. The
      // dependencies array is an array of relative paths. These paths are
      // relative to the file that imported them. We can turn the relative path
      // into an absolute one by joining it with the path to the directory of
      // the parent asset.
      const absolutePath = path.join(dirname, relativePath);

      // Parse the asset, read its content, and extract its dependencies.
      const child = createAsset(absolutePath);

      // It's essential for us to know that `asset` depends on `child`. We
      // express that relationship by adding a new property to the `mapping`
      // object with the id of the child.
      asset.mapping[relativePath] = child.id;

      // Finally, we push the child asset into the queue so its dependencies
      // will also be iterated over and parsed.
      queue.push(child);
    });
  }

  // At this point the queue is just an array with every module in the target
  // application: This is how we represent our graph.
  return queue;
}

// Next, we define a function that will use our graph and return a bundle that
// we can run in the browser.
//
// Our bundle will have just one self-invoking function:
//
// (function() {})()
//
// That function will receive just one parameter: An object with information
// about every module in our graph.
function bundle(graph) {
  let modules = "";

  // Before we get to the body of that function, we'll construct the object that
  // we'll pass to it as a parameter. Please note that this string that we're
  // building gets wrapped by two curly braces ({}) so for every module, we add
  // a string of this format: `key: value,`.
  graph.forEach((mod) => {
    // Every module in the graph has an entry in this object. We use the
    // module's id as the key and an array for the value (we have 2 values for
    // every module).
    //
    // The first value is the code of each module wrapped with a function. This
    // is because modules should be scoped: Defining a variable in one module
    // shouldn't affect others or the global scope.
    //
    // Our modules, after we transpiled them, use the CommonJS module system:
    // They expect a `require`, a `module` and an `exports` objects to be
    // available. Those are not normally available in the browser so we'll
    // implement them and inject them into our function wrappers.
    //
    // For the second value, we stringify the mapping between a module and its
    // dependencies. This is an object that looks like this:
    // { './relative/path': 1 }.
    //
    // This is because the transpiled code of our modules has calls to
    // `require()` with relative paths. When this function is called, we should
    // be able to know which module in the graph corresponds to that relative
    // path for this module.
    modules += `${mod.id}: [
      function (require, module, exports) {
        ${mod.code}
      },
      ${JSON.stringify(mod.mapping)},
    ],`;
  });

  // Finally, we implement the body of the self-invoking function.
  //
  // We start by creating a `require()` function: It accepts a module id and
  // looks for it in the `modules` object we constructed previously. We
  // destructure over the two-value array to get our function wrapper and the
  // mapping object.
  //
  // The code of our modules has calls to `require()` with relative file paths
  // instead of module ids. Our require function expects module ids. Also, two
  // modules might `require()` the same relative path but mean two different
  // modules.
  //
  // To handle that, when a module is required we create a new, dedicated
  // `require` function for it to use. It will be specific to that module and
  // will know to turn its relative paths into ids by using the module's
  // mapping object. The mapping object is exactly that, a mapping between
  // relative paths and module ids for that specific module.
  //
  // Lastly, with CommonJs, when a module is required, it can expose values by
  // mutating its `exports` object. The `exports` object, after it has been
  // changed by the module's code, is returned from the `require()` function.
  const result = `
    (function(modules) {
      function require(id) {
        const [fn, mapping] = modules[id];

        function localRequire(name) {
          return require(mapping[name]);
        }

        const module = { exports : {} };

        fn(localRequire, module, module.exports);

        return module.exports;
      }

      require(0);
    })({${modules}})
  `;

  // We simply return the result, hurray! :)
  return result;
}

const graph = createGraph("./example/entry.js");
const result = bundle(graph);

console.log(result);
fs.mkdirSync("./lib", { recursive: true });
fs.writeFileSync("./lib/bundle.js", result);
