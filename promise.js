const PENDING = 'PENDING';
const FULFILLED = 'FULFILLED';
const REJECTED = 'REJECTED';

const nextTick = (() => {
    const root = typeof window === "undefined" ? global : window;

    if (typeof root.process === "object" && typeof root.process.nextTick === 'function') {
        return fn => global.process.nextTick(fn);
    }

    return fn => setTimeout(fn, 0)
})();

const promiseResolutionProcedure = (promise, result, async = true) => {
    if (promise === result) {
        promise._reject(new TypeError("Chaining cycle detected for promise"));
        return;
    }

    /**
     * 这里有两种情况
     * 1. 接收到的是一个新的promise对象
     * 2. 接收到的是一个thenable对象
     */

    if (result instanceof RPromise) {
        switch (result.state) {
            case FULFILLED:
                nextTick(() => {
                    promise.resolve(result.value);
                });
                break;
            case REJECTED:
                nextTick(() => {
                    promise.reject(result.value);
                });
                break;
            case PENDING:
                const resolve = result.resolve;
                const reject = result.reject;

                result.resolve = function (value) {
                    resolve(value);
                    promise.resolve(value);
                };

                result.reject = function (reason) {
                    reject(reason);
                    promise.reject(reason);
                };
                break;
        }

        return;
    }

    if (result && typeof result.then === 'function') {
        let isFlag = false;

        const resolve = value => {
            if (isFlag) {
                return;
            }

            isFlag = true;

            promiseResolutionProcedure(promise, value);
        }

        const reject = reason => {
            if (isFlag) {
                return;
            }

            isFlag = true;

            promise.reject(reason);
        }

        const nextTemp = () => {
            try {
                result.then(resolve, reject);
            } catch (e) {
                resolve(e);
            }
        };

        if (async) {
            nextTick(nextTemp);
        } else {
            nextTemp();
        }

        return;
    }

    promise.resolve(result);
}

class RPromise {
    constructor(executor) {
        if (typeof executor !== 'function') {
            throw new TypeError("Promise resolver undefined is not a function");
        }

        this.state = PENDING;
        this.value = undefined;
        this.reason = undefined;


        this.resolveQueue = [];
        this.rejectQueue = [];

        promiseResolutionProcedure(this, { then: executor }, false);
    }

    then(onFulfilled, onRejected) {
        const _onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : RPromise.resolve;
        const _onRejected = typeof onRejected === 'function' ? onRejected : RPromise.reject;

        /**
         * 每次then之后得到的都是一个全新的promise
         */
        const _promise = new RPromise(() => { });

        try {
            switch (this.state) {
                case PENDING:
                    this.resolveQueue.push(_onFulfilled);
                    this.rejectQueue.push(_onRejected);
                    break;
                case FULFILLED:
                    nextTick(() => promiseResolutionProcedure(_promise, _onFulfilled(this.value)));
                    break;
                case REJECTED:
                    nextTick(() => promiseResolutionProcedure(_promise, _onRejected(this.reason)));
                    break;
            }
        } catch (e) {
            this.reject(e);
        } finally {
            return _promise;
        }
    }

    resolve(value) {
        if (this.state !== PENDING) {
            return;
        }

        this.state = FULFILLED;
        this.value = value;

        this.resolveQueue.forEach(trigger => trigger(value));
        this.resolveQueue.length = 0;
        this.rejectQueue.length = 0;
    }

    reject(reason) {
        if (this.state !== PENDING) {
            return;
        }

        this.state = REJECTED;
        this.reason = reason;

        this.rejectQueue.forEach(trigger => trigger(reason));
        this.resolveQueue.length = 0;
        this.rejectQueue.length = 0;
    }

    catch(onRejected) {
        return this.then(undefined, onRejected);
    }

    static resolve(value) {
        return new RPromise(resolve => resolve(value));
    }

    static reject(reasion) {
        return new RPromise((resolve, reject) => reject(value));
    }
}
