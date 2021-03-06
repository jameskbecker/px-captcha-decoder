import generate from '@babel/generator';
import traverse, { Visitor } from '@babel/traverse';
import {
  File,
  FunctionDeclaration,
  Identifier,
  isBinaryExpression,
  isCallExpression,
  isConditionalExpression,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isMemberExpression,
  isNumericLiteral,
  isObjectExpression,
  isObjectProperty,
  isReturnStatement,
  isStringLiteral,
  isTryStatement,
  isUnaryExpression,
  isVariableDeclaration,
  VariableDeclaration,
} from '@babel/types';
import config, { prefix } from '../config';

export const labelAtobPolyfill = (ast: File) => {
  console.log('Labelling Atob Polyfill');
  traverse(ast, {
    VariableDeclarator(path) {
      const { node } = path;
      path.traverse({
        ReturnStatement(p2) {
          const { node: node2 } = p2;
          if (isIdentifier(node2.argument) && node2.argument.name === 'atob') {
            if (isIdentifier(node.id)) path.scope.rename(node.id.name, config.atob.getter);
          }
        },
      });
    },
  });
  return ast;
};

const isAtobGetter = (node: VariableDeclaration) => {
  const { kind, declarations } = node;
  if (kind !== 'var' || declarations.length !== 1) return false;

  const { init, id } = declarations[0];
  if (!isCallExpression(init) || !isIdentifier(id)) return false;
  if (!isFunctionExpression(init.callee)) return false;

  const { id: id2, params, body } = init.callee;
  if (id2 || params.length > 0 || body.body.length < 1) return false;

  const [wrapper] = body.body;
  if (!isTryStatement(wrapper)) return false;
  if (wrapper.block.body.length !== 1) return false;

  const [returner] = wrapper.block.body;
  if (generate(returner).code !== 'return window.atob;') return false;
  return true;
};

export const labelAtobGetter = (): Visitor => {
  return {
    VariableDeclaration: (path) => {
      const { node } = path;
      if (!isAtobGetter(node)) return;

      const { id } = node.declarations[0];
      path.scope.rename((<Identifier>id).name, config.atob.call);
    },
  };
};

const isAtobWrapper = (node: FunctionDeclaration) => {
  const { params } = node;
  if (params.length !== 1) return false;

  const { body } = node.body;
  if (body.length !== 1 || !isReturnStatement(body[0])) return false;

  const { argument } = body[0];
  if (!isConditionalExpression(argument)) return;

  const { test, consequent, alternate } = argument;
  if (!isBinaryExpression(test) || !isCallExpression(consequent) || !isCallExpression(alternate)) return false;

  const { callee } = alternate;
  if (!isIdentifier(callee)) return false;

  const { callee: callee2 } = consequent;
  if (!isIdentifier(callee2)) return false;
  if (callee2.name !== config.atob.call) return false;

  return true;
};

export const labelAtobWrapper = (): Visitor => {
  return {
    FunctionDeclaration: (path) => {
      const { node } = path;
      if (!isAtobWrapper(node)) return;
      const { id } = node;
      path.parentPath.scope.rename((<Identifier>id).name, config.atob.wrapper);

      //@ts-ignore
      const { name }: string = node.body.body[0].argument.alternate.callee;
      path.parentPath.scope.rename(name, config.atob.poly);
    },
  };
};

export const labelDecodeBWrapper = (): Visitor => {
  return {
    FunctionDeclaration(path) {
      const { node } = path;
      const { params, id } = node;
      if (params.length !== 1 || !isIdentifier(id)) return;

      const { body } = node.body;
      if (body.length !== 1 || !isReturnStatement(body[0])) return;

      const { argument } = body[0];
      if (!isConditionalExpression(argument)) return;

      const { test, consequent, alternate } = argument;
      if (!isBinaryExpression(test) || !isCallExpression(consequent) || !isCallExpression(alternate)) return;

      const { left, operator, right } = test;
      if (!isStringLiteral(left) || operator !== '==' || !isUnaryExpression(right)) return;

      let { callee } = consequent;
      if (!isIdentifier(callee) || consequent.arguments.length !== 1) return;

      callee = alternate.callee;
      if (!isIdentifier(callee) || consequent.arguments.length !== 1) return;

      path.parentPath.scope.rename(id.name, config.atob.wrapper);
    },
  };
};

export const labelGetters = (): Visitor => {
  return {
    FunctionDeclaration(path) {
      const { node } = path;
      const { body } = node.body;
      if (!node.id) return;
      if (body.length !== 1 || !isReturnStatement(body[0]) || !isIdentifier(body[0].argument)) return;
      const { name } = body[0].argument;
      path.parentPath.scope.rename(node.id.name, prefix + 'get_' + name);
    },
  };
};

export const labelResponseHandlers = (): Visitor => {
  return {
    VariableDeclarator(path) {
      const { node } = path;
      const { id, init } = node;

      if (!isObjectExpression(init)) return;
      const { properties } = init;

      let hasBake = false;

      for (let i = 0; i < properties.length; i++) {
        const prop = properties[i];
        if (isObjectProperty(prop) && isIdentifier(prop.key) && isIdentifier(prop.value) && prop.key.name === 'bake') {
          hasBake = true;
          break;
        }
      }

      if (!hasBake) return;
      for (let i = 0; i < properties.length; i++) {
        const prop = properties[i];
        if (isObjectProperty(prop) && isIdentifier(prop.key) && isIdentifier(prop.value)) {
          path.scope.rename(prop.value.name, prefix + prop.key.name + 'Handler');
        }
      }

      if (!isIdentifier(id)) return;
      path.scope.rename(id.name, prefix + 'responseHandlers');
      path.stop();
    },
  };
};

export const labelResponseHandlerParams = (ast: File) => {
  const params = {
    ___bakeHandler: ['name', 'expires', 'value', 'useDomain', 'o'],
    ___cfeHandler: ['___a', '___b', '___c', '___d'],
    ___sffHandler: ['___a', '___b', '___c'],
    ___sffeHandler: ['___a'],
    ___enHandler: ['name', 'expires', 'value', 'useDomain', 'o'],
    ___sidHandler: ['sid'],
    ___vidHandler: ['value', 'expires', 'useDomain'],
    ___teHandler: ['___a', '___b', '___c', '___d', '___e', '___f'],
    ___jscHandler: ['___a', '___b', '___c'],
    ___preHandler: ['___a'],
    ___keysHandler: ['___a', '___b'],
    ___csHandler: ['value'],
    ___clsHandler: ['value', 'expires', 'useDomain'],
    ___stsHandler: ['startTs'],
    ___drcHandler: ['px985Value'],
    ___wcsHandler: ['px943Value'],
    ___valsHandler: ['___a'],
    ___ciHandler: ['___a', '___b', '___c', '___d'],
    ___spiHandler: [],
    ___cvHandler: ['___a'],
    ___rmhdHandler: [],
    ___rwdHandler: [],
    ___cpHandler: ['___a', '___b', '___c', 'd'],
    ___ctsHandler: ['___a', '___b'],
  };

  const updateParamNameVisitor = {
    Identifier(this: any, path) {
      const { node } = path;
      for (let i = 0; i < this.paramNames.length; i++) {
        if (node.name === this.paramNames[i]) {
          if (!params.hasOwnProperty(this.type)) return;
          node.name = params[this.type][i];
        }
      }
    },
  };
  traverse(ast, {
    FunctionDeclaration(path) {
      const { node } = path;
      const { id, params } = node;
      if (!isIdentifier(id)) return;
      const [nonIdentifier] = params.filter((p) => p.type !== 'Identifier');
      if (nonIdentifier) return;

      const paramNames = params.map((p: Identifier) => p.name);

      params.forEach((v, i) => {
        //@ts-ignore
        v.name = paramNames[i];
      });
      path.traverse(updateParamNameVisitor, { paramNames, type: id.name });
    },
  });
  return ast;
};

export const labelChartDecode = (ast: File) => {
  console.log('Labelling Chart Decode Function');
  traverse(ast, {
    FunctionDeclaration(path) {
      const { node } = path;
      let found = false;
      if (!isIdentifier(node.id)) return;
      path.traverse({
        CallExpression(p2) {
          const n2 = p2.node;
          if (
            isMemberExpression(n2.callee) &&
            isStringLiteral(n2.callee.object) &&
            n2.callee.object.value.length === 7 &&
            isIdentifier(n2.callee.property) &&
            n2.callee.property.name === 'charCodeAt'
          ) {
            found = true;
          }
        },
      });
      if (found) {
        path.parentPath.scope.rename(node.id.name, prefix + 'chartDecode');
      }
    },
  });
  return ast;
};

const isAtobDec = (node: VariableDeclaration) => {
  return (
    node.declarations.length !== 0 &&
    isCallExpression(node.declarations[0].init) &&
    isIdentifier(node.declarations[0].init.callee) &&
    node.declarations[0].init.callee.name === 'atob'
  );
};

const isCharCodeAtDec = (node: VariableDeclaration) => {
  return (
    node.declarations.length !== 0 &&
    isCallExpression(node.declarations[0].init) &&
    isMemberExpression(node.declarations[0].init.callee) &&
    isIdentifier(node.declarations[0].init.callee.property) &&
    node.declarations[0].init.callee.property.name === 'charCodeAt' &&
    isNumericLiteral(node.declarations[0].init.arguments[0]) &&
    node.declarations[0].init.arguments[0].value === 0
  );
};

export const labelStandardDecode = (ast: File) => {
  console.log('Labelling Standard Decode Function');
  traverse(ast, {
    FunctionDeclaration(path) {
      const { node, parentPath } = path;
      const { id } = node;
      const { body } = node.body;

      if (
        !isIdentifier(id) ||
        !isVariableDeclaration(body[0]) ||
        !isVariableDeclaration(body[1]) ||
        !isVariableDeclaration(body[2])
      )
        return;
      if (!isAtobDec(body[0]) || !isCharCodeAtDec(body[1])) return;

      const { scope } = parentPath;
      scope.rename(id.name, config.standard);
    },

    // ForStatement(path) {
    //   const { node } = path;
    //   const { init } = node;
    //   if (!isVariableDeclaration(init)) return;

    //   let forReg = /var \w\=atob\(\w\),\w=\w\.charCodeAt\(0\)/;
    //   let decString = generate(init, { compact: true }).code;

    //   if (forReg.test(decString)) {
    //     let funcPath = path.getFunctionParent();
    //     if (!funcPath) return;
    //     const funcNode = funcPath.node;

    //     if (!isFunctionDeclaration(funcNode)) return;
    //     const { id } = funcNode;

    //     if (!isIdentifier(id)) return;

    //     funcPath.parentPath.scope.rename(id.name, prefix + 'standardDecode');
    //   }
    //},
    // FunctionDeclaration(path) {
    //   const { node } = path;
    //   let found = false;
    //   if (!isIdentifier(node.id)) return;
    //   path.traverse({
    //     CallExpression(p2) {
    //       const n2 = p2.node;
    //       if (!isMemberExpression(n2.callee)) return;

    //       const { object, property } = n2.callee;
    //       if (!isIdentifier(object) || !isIdentifier(property)) return;
    //       if (property.name !== 'charCodeAt') return;
    //       const [arg1, arg2] = n2.arguments;

    //       if (!isNumericLiteral(arg1) || arg1.value !== 0) return;
    //       /var \w \= atob\(\w\), \w = \w\.charCodeAt\(0\), \w \= ''/
    //       //console.log(generate(node).code);
    //       //found = true;
    //     },
    //});
    // if (found) {
    //   path.parentPath.scope.rename(node.id.name, prefix + 'standardDecode');
    // }
    //},
  });
  return ast;
};

/** @todo fix not working properly */
export const labelCatchParam = (): Visitor => {
  return {
    CatchClause(path) {
      const { node } = path;
      const { param } = node;

      if (!isIdentifier(param)) return;
      param.name = 'err';
    },
  };
};

export const labelPerformanceNow = (): Visitor => {
  return {
    FunctionDeclaration(path) {
      const { node } = path;

      const { id, params, body } = node;
      if (!id || params.length !== 0) return;

      if (body.body.length !== 1 || !isReturnStatement(body.body[0])) return;

      const { argument } = body.body[0];
      if (!argument) return;

      const testString = 'window.performance && window.performance.now ? window.performance.now() : Date.now()';
      if (generate(argument).code !== testString) return;

      path.parentPath.scope.rename(id.name, prefix + 'performanceNow');
    },
  };
};
