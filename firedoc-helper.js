var path = require('path');
var Firedoc = require('firedoc').Firedoc;


var basicTypeMap = {
  number  : 'Number',
  Number  : 'Number',
  string  : 'String',
  String  : 'String',
  array   : 'Array',
  Array   : 'Array',
  boolean : 'Boolean',
  Boolean : 'Boolean',
  object  : 'Object',
  Object  : 'Object'
};


function transforType(module, type) {

  // don't transfor basic types
  if (basicTypeMap[type])
    return basicTypeMap[type];

  // add 'cc' prefix for engine module
  if (module === 'cc') 
    return 'cc'.concat(type);

  // just return the type
  // TODO: some special operation for editor framework?
  return type;
}

// retrive necessary information from AST.members
// property = {
//    itemtype: ['method', 'property'], the value is 'method' if it is a method
//    type: the property type if itemtype='property'
//    return: {type: } the return type of method if it is a method
// }
//
// return value {name: description}
function generateMember(property) {
  var name = property.name;
  var description = '';

  if (property.itemtype === 'method') {
    // methods start with '?'
    description = description.concat('?')

    // return type
    var retType = property.return;
    if (retType)
        // FIXME: should change it when the framework comment use full type
        description = description.concat(transforType(property.module, retType));
    else
        description = description.concat('undefined');

    // parameter names
    var params = property.params;
    if (params) {
      description = description.concat(':');
      for (var i in params) {
        var param = params[i];
        description = description.concat(param.name);
        description = description.concat(',');
      }
      // remove last ','
      description = description.slice(0, -1);
    }
  } 
  else {
    // it is a normal property, we just need its type information
    description = transforType(property.module, property.type);
  }

  var ret = {};
  ret[name] = new Definition(description, property.description);
  return ret;
}

function generateClass(clazz) {

    try {
      var ret = {};
      
      var description = clazz.namespace.split('.').join('');
      var superName = '';

      // super name
      var extend = clazz.extends;
      if (typeof(extend) === 'string') 
        // FIXME: should change it when the framework comment use full type
        superName = transforType(clazz.module, extend);
      else
        superName = 'Object';

      // parameters for construction
      var params = clazz.params;
      if (params) {
        description = '?'.concat(description);
        description = description.concat(':');
        for (var i in params) {
            var param = params[i];
            description = description.concat(param.name);
            description = description.concat(',');
        }
        // remove last ','
        description.slice(0, -1);
      }

      // it is used to create class declaration
      var name = transforType(clazz.module, clazz.name)
      ret.classMeta = {};
      ret.classMeta[name] = {
        $$isBuiltin: true,
        $$proto: new Definition(superName)
      };

      var moduleMeta = {};
      moduleMeta[clazz.name] = new Definition(description, clazz.description);
      ret.moduleMeta = moduleMeta;
      
      return ret;
    } catch (e) {
      console.log('exception happens in ' + clazz.file);
      console.log('class name is ' + clazz.name);
      console.log(e);
    }
}

function printDashes() {
    console.log('---------------------------------');
}

function mergeObject(dst, src) {
    for (var attr in src) {
        dst[attr] = src[attr];
    }
}

function formatModuleInfos(modulesInfo) {
  for (var moduleName in modulesInfo) {
    var classesInfo = {};
    var module = modulesInfo[moduleName];
    for (var className in module.classes) {
      var classInfo = module.classes[className];
      mergeObject(classesInfo, classInfo);
    }
    module.classesInfo = classesInfo;
    delete module.classes;
  }
}

function generateModules(ast) {

    // modulesInfo = { moduleName: // module name
    //                            classes: {className: 
    //                                                 { classMeta } 
    //                                      },
    //                            members: [ {name, decription} ]
    //               }
    var modulesInfo = {};

    // get module name  
    for (var moduleName in ast.modules) {
      modulesInfo[moduleName] = { classes: {},
                                  $$isBuiltin: true,
                                  $$proto: new Definition('Object') };
    }

  // get class info
  for (var className in ast.classes) {
    var c = ast.classes[className];
    var moduleName = c.module;
    if (!moduleName)
        continue;
    
    var classInfo = generateClass(c);
    if (!classInfo)
        continue;

    if (!modulesInfo[moduleName]) {
        console.log('!!!module of class: ' + className + ' is not a valid value: ' + moduleName);
        continue;
    }
    modulesInfo[moduleName].classes[className] = classInfo.classMeta;
    mergeObject(modulesInfo[moduleName], classInfo.moduleMeta);
  }

  // get class property info
  for (var i in ast.members) {
    var member = ast.members[i];
    if (member.name === '') {
        printDashes();
        console.log('!!!Do not have name');
        console.log(member)
        continue;
        printDashes();
    }
        

    var moduleName= member.module;
    if (!modulesInfo[moduleName]) {
      printDashes();
      console.log('!!!module of ' + member.name + ' is not a valid value: ' + moduleName);
      console.log(member.file);
      printDashes();
      continue;
    }

    var memberInfo = generateMember(member);
    var isModuleFunction = (member.clazz === '');
    if (isModuleFunction) {
        // it is a module member
        mergeObject(modulesInfo[moduleName], memberInfo);
    }
    else {
        // it is a class member
        var className = member.clazz;
        if (!modulesInfo[moduleName].classes[member.clazz]) {
            printDashes();
            console.log('!!!class of ' + member.name + ' is not a valid value: ' + className);
            console.log(member.file);
            printDashes();
            continue;
        }
        var classInfo = modulesInfo[moduleName].classes[className];
        var transformedClassName = transforType(moduleName, className);
        mergeObject(classInfo[transformedClassName], memberInfo);
    }
  }

  formatModuleInfos(modulesInfo);
  return modulesInfo;
}

// copy from 'esprima/types.js'
var Definition = function(typeName, description, range, path) {
    this.typeName = typeName;
    this.range = range;
    this.path = path;
    this.description = description;
};

var enginePath = path.join(__dirname, 'api/engine');
var editorFrameworkPath = path.join(__dirname, 'api/editor-framework/lib');
var assetdbPath = path.join(__dirname, 'api/asset-db');

exports.genrateBuiltin = function() {
    var doc = new Firedoc({
      cwd: __dirname,
      paths: [enginePath, editorFrameworkPath, assetdbPath],
      parseOnly: true
    });

    doc.build(function(err, ast, opt) {
      var builtins = generateModules(ast);
      var types = require('./esprima/types.js').Types;
      for (var module in builtins) {
        types.prototype[module] = builtins[module];
        mergeObject(types.prototype, builtins[module].classesInfo);
        delete builtins[module].classesInfo;
      }
    });
}
