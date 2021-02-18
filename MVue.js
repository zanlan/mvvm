const compileUtil = {
    getVal(expr, vm) {
        return expr.split('.').reduce((data, currentVal) => {
            return data[currentVal]
        }, vm.$data)
    },
    setVal(vm, expr, val) {
        return expr.split('.').reduce((data, currentVal, index, arr) => {
            return data[currentVal] = val
        }, vm.$data)
    },
    getContentVal(expr, vm) {
        return expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
            return this.getVal(args[1], vm);
        })
    },
    text(node, expr, vm) { //expr 可能是 {{obj.name}}--{{obj.age}} 
        let val;
        if (expr.indexOf('{{') !== -1) {
            // 
            val = expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
                //绑定watcher从而更新视图
                new Watcher(vm, args[1], () => {
                    this.updater.textUpdater(node, this.getContentVal(expr, vm));
                })
                return this.getVal(args[1], vm);
            })
        } else { //也可能是v-text='obj.name' v-text='msg'
        new Watcher(vm, expr, () => {
            this.updater.textUpdater(node, this.getVal(expr, vm));
        })
            val = this.getVal(expr, vm);
        }
        this.updater.textUpdater(node, val);

    },

    html(node, expr, vm) {
        let val = this.getVal(expr, vm);
        new Watcher(vm, expr, (newVal) => {
            this.updater.htmlUpdater(node, newVal);
        })
        this.updater.htmlUpdater(node, val);
    },
    model(node, expr, vm) {
        const val = this.getVal(expr, vm);

        new Watcher(vm, expr, (newVal) => {
            this.updater.modelUpdater(node, newVal);
        })
        node.addEventListener('input', (e) => {
            this.setVal(vm, expr, e.target.value);

        }, false);
        this.updater.modelUpdater(node, val);
    },
    on(node, expr, vm, eventName) {
        let fn = vm.$options.methods && vm.$options.methods[expr];
        node.addEventListener(eventName, fn.bind(vm), false);
    },
    bind(node, expr, vm, attrName) {
        let attrVal = this.getVal(expr, vm);
        this.updater.attrUpdater(node, attrName, attrVal);
    },
    updater: {
        attrUpdater(node, attrName, attrVal) {
            node.setAttribute(attrName, attrVal);
        },
        modelUpdater(node, value) {
            node.value = value;
        },
        textUpdater(node, value) {
            node.textContent = value;
        },
        htmlUpdater(node, value) {
            node.innerHTML = value;
        }
    }
}


class Dep {
    constructor() {
        this.subs = []
    }
    // 添加订阅者
    addSub(watcher) {
        this.subs.push(watcher);

    }
    // 通知变化
    notify() {
        // 观察者中有个update方法 来更新视图
        this.subs.forEach(w => w.update());
    }
}



//Watcher.js
class Watcher {
    constructor(vm, expr, cb) {
        // 观察新值和旧值的变化,如果有变化 更新视图
        this.vm = vm;
        this.expr = expr;
        this.cb = cb;
        // 先把旧值存起来  
        this.oldVal = this.getOldVal();
    }
    getOldVal() {
        Dep.target = this;
        let oldVal = compileUtil.getVal(this.expr, this.vm);
        Dep.target = null;
        return oldVal;
    }
    update() {
        // 更新操作 数据变化后 Dep会发生通知 告诉观察者更新视图
        let newVal = compileUtil.getVal(this.expr, this.vm);
        if (newVal !== this.oldVal) {
            this.cb(newVal);
        }
    }
}





class Compile {
    constructor(el, vm) {
        this.el = this.isElementNode(el) ? el : document.querySelector(el);
        this.vm = vm;
        const fragment = this.node2Fragment(this.el);
        this.compile(fragment)

        this.el.appendChild(fragment);

    }
    compile(fragment) {
        const childNodes = fragment.childNodes;
        [...childNodes].forEach(child => {

            if (this.isElementNode(child)) {
                this.compileElement(child);
            } else {
                this.compileText(child);
            }
            if (child.childNodes && child.childNodes.length) {
                this.compile(child);
            }
        })
    }

    // 编译文本的方法
    compileText(node) {
        const content = node.textContent;
        // 匹配{{xxx}}的内容
        if (/\{\{(.+?)\}\}/.test(content)) {
            // 处理文本节点
            compileUtil['text'](node, content, this.vm)
        }
    }

    node2Fragment(el) {
        const fragment = document.createDocumentFragment();
        let firstChild;
        while (firstChild = el.firstChild) {
            fragment.appendChild(firstChild);
        }
        return fragment
    }
    isElementNode(el) {
        return el.nodeType === 1;
    }
    compileElement(node) {
        // 获取该节点的所有属性
        const attributes = node.attributes;
        // 对属性进行遍历
        [...attributes].forEach(attr => {
            const { name, value } = attr; //v-text v-model   v-on:click  @click 
            // 看当前name是否是一个指令
            if (this.isDirective(name)) {
                //对v-text进行操作
                const [, directive] = name.split('-'); //text model html
                // v-bind:src
                const [dirName, eventName] = directive.split(':'); //对v-on:click 进行处理
                // 更新数据
                compileUtil[dirName] && compileUtil[dirName](node, value, this.vm, eventName);
                // 移除当前元素中的属性
                node.removeAttribute('v-' + directive);

            } else if (this.isEventName(name)) {
                // 对事件进行处理 在这里处理的是@click
                let [, eventName] = name.split('@');
                compileUtil['on'](node, value, this.vm, eventName)
            }

        })

    }
    // 是否是@click这样事件名字
    isEventName(attrName) {
        return attrName.startsWith('@')
    }
    //判断是否是一个指令
    isDirective(attrName) {
        return attrName.startsWith('v-')
    }

}



class Observer {
    constructor(data) {
        this.observe(data);
    }
    observe(data) {
        if (data && typeof data === 'object') {
            Object.keys(data).forEach(key => {
                this.defineReactive(data, key, data[key]);
            })

        }
    }
    defineReactive(obj, key, value) {
        this.observe(value)
        const dep = new Dep()
        Object.defineProperty(obj, key, {
            get() {
                 //订阅数据变化,往Dep中添加观察者
                Dep.target && dep.addSub(Dep.target);
                return value;
            },
            set: (newVal) => {
                if (newVal !== value) {
                    this.observe(newVal);
                    value = newVal;
                    dep.notify();
                }
            }
        })
    }
}




class Vue {
    constructor(options) {
        this.$data = options.data;
        this.$el = options.el;
        this.$options = options
        if (this.$el) {
            new Observer(this.$data);

            this.proxyData(this.$data);

            new Compile(this.$el, this);

        }
    }
    proxyData(data) {
        for (const key in data) {
            Object.defineProperty(this, key, {
                get() {
                    return data[key];
                },
                set(newVal) {
                    data[key] = newVal;
                }
            })
        }
    }
}
