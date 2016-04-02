import events from 'events';
import Clusterize from 'clusterize.js';
import { flatten } from 'flattree';
import LookupTable from './lookup-table';
import { defaultRowRenderer } from './renderer';
import { stopPropagation, addEventListener, removeEventListener } from './polyfill';
import { classNames } from './utils';

const extend = (target, ...sources) => {
    if (target === undefined || target === null) {
        throw new TypeError('Cannot convert undefined or null to object');
    }

    const output = Object(target);
    for (let index = 0; index < sources.length; index++) {
        const source = sources[index];
        if (source !== undefined && source !== null) {
            for (let key in source) {
                if (source.hasOwnProperty(key)) {
                    output[key] = source[key];
                }
            }
        }
    }
    return output;
};

class InfiniteTree extends events.EventEmitter {
    options = {
        autoOpen: false,
        el: null,
        rowRenderer: defaultRowRenderer
    };
    state = {
        openNodes: [],
        selectedNode: null
    };
    clusterize = null;
    tbl = new LookupTable();
    nodes = [];
    rows = [];
    scrollElement = null;
    contentElement = null;

    contentListener = (evt) => {
        let { target, currentTarget } = evt;

        stopPropagation(evt);

        if (target !== currentTarget) {
            let itemTarget = target;
            let handleToggler = false;

            while (itemTarget && itemTarget.parentElement !== currentTarget) {
                if (itemTarget.className.indexOf('tree-toggler') >= 0) {
                    handleToggler = true;
                }
                itemTarget = itemTarget.parentElement;
            }

            const id = itemTarget.getAttribute('aria-id');
            const node = this.getNodeById(id);

            if (!node) {
                return;
            }

            // Click on the toggler to open/close a tree node
            if (handleToggler) {
                this.toggleNode(node);
            } else {
                this.selectNode(node);
            }
        }
    };

    constructor(options = {}) {
        super();

        // Assign options
        this.options = extend({}, this.options, options);

        if (!this.options.el) {
            console.error('Failed to initialize infinite-tree: el is not specified.', options);
            return;
        }

        this.create();

        // Load tree data if it's provided
        if (options.data) {
            this.loadData(options.data);
        }
    }
    create() {
        if (!this.options.el) {
            throw new Error('The element option is not specified.');
        }

        const scrollElement = document.createElement('div');
        scrollElement.className = classNames(
            'infinite-tree',
            'infinite-tree-scroll'
        );
        const contentElement = document.createElement('div');
        contentElement.className = classNames(
            'infinite-tree',
            'infinite-tree-content'
        );

        scrollElement.appendChild(contentElement);
        this.options.el.appendChild(scrollElement);

        this.clusterize = new Clusterize({
            tag: 'div',
            rows: [],
            scrollElem: scrollElement,
            contentElem: contentElement,
            no_data_class: 'infinite-tree-no-data',
            callbacks: {
                // Will be called right before replacing previous cluster with new one.
                clusterWillChange: () => {
                },
                // Will be called right after replacing previous cluster with new one.
                clusterChanged: () => {
                },
                // Will be called on scrolling. Returns progress position.
                scrollingProgress: (progress) => {
                    this.emit('scrollProgress', progress);
                }
            }
        });

        this.scrollElement = scrollElement;
        this.contentElement = contentElement;

        addEventListener(this.contentElement, 'click', this.contentListener);
    }
    clear() {
        this.clusterize.clear();
        this.tbl.clear();
        this.nodes = [];
        this.rows = [];
        this.state.openNodes = [];
        this.state.selectedNode = null;
    }
    destroy() {
        removeEventListener(this.contentElement, 'click', this.contentListener);

        this.clear();

        if (this.clusterize) {
            this.clusterize.destroy(true); // True to remove all data from the list
            this.clusterize = null;
        }

        // Remove all child nodes
        while (this.contentElement.firstChild) {
            this.contentElement.removeChild(this.contentElement.firstChild);
        }
        while (this.scrollElement.firstChild) {
            this.scrollElement.removeChild(this.scrollElement.firstChild);
        }
        if (this.options.el) {
            const containerElement = this.options.el;
            while (containerElement.firstChild) {
                containerElement.removeChild(containerElement.firstChild);
            }
        }
        this.contentElement = null;
        this.scrollElement = null;
    }
    // Updates list with new data
    update() {
        this.clusterize.update(this.rows);
    }
    // Adds a child node to a node.
    // @param {object} parent The object that defines the parent node.
    // @param {object} newChild The object that defines the new child node.
    // @return {boolean} Returns true on success, false otherwise.
    addChildNode(parent = null, newChild = null) {
        const { rowRenderer } = this.options;

        if (!newChild) {
            return false;
        }
        if (!parent) {
            // Traversing up through ancestors to find the root node.
            parent = (this.nodes.length > 0) ? this.nodes[0] : null;
            while (parent && parent.parent !== null) {
                parent = parent.parent;
            }
        }
        if (!newChild.parent) {
            parent.children = parent.children || [];
            parent.children.push(newChild);
            newChild.parent = parent;
        }

        const total = parent.state.total;
        const nodes = flatten(parent.children, { openNodes: this.state.openNodes }).slice(total);
        const rows = nodes.map(node => rowRenderer(node));

        // The newChildIndex will be equal to total if the parent node is the root.
        // i.e. newChildIndex = -1 + total + 1 = total
        const newChildIndex = (this.nodes.indexOf(parent) + total + 1);

        // Insert an array inside another array
        this.nodes.splice.apply(this.nodes, [newChildIndex, 0].concat(nodes));
        this.rows.splice.apply(this.rows, [newChildIndex, 0].concat(rows));
        this.rows[newChildIndex] = rowRenderer(newChild);

        // Add nodes to the lookup table
        nodes.forEach((node) => {
            if (node.id !== undefined) {
                this.tbl.set(node.id, node);
            }
        });

        // Updates list with new data
        this.update();

        return true;
    }
    // Adds a child node to a node at the specified index.
    //   * If the parent is null or undefined, inserts the child at the specified index in the top-level.
    //   * If the parent has children, the method adds the child to it at the specified index.
    //   * If the parent does not have children, the method adds the child to the parent.
    //   * If the index value is greater than or equal to the number of children in the parent, the method adds the child at the end of the children.
    // @param {object} parent The object that defines the parent node.
    // @param {object} newChild The object that defines the new child node.
    // @param {number} index The 0-based index of where to insert the child node.
    addChildNodeAt(parent, newChild, index) {
    }
    // Adds a new sibling node after the current node.
    // @param {object} node The object that defines the current node.
    // @param {object} newSibling The object that defines the new sibling node.
    addSiblingNodeAfter(node, newSibling) {
        // TODO
    }
    // Adds a new sibling node before the current node.
    // @param {object} node The object that defines the current node.
    // @param {object} newSibling The object that defines the new sibling node.
    addSiblingNodeBefore(node, newSibling) {
        // TODO
    }
    // Closes a node to hide its children.
    // @param {object} node The object that defines the node.
    // @return {boolean} Returns true on success, false otherwise.
    closeNode(node) {
        const { rowRenderer } = this.options;

        // Retrieve node index
        const nodeIndex = this.nodes.indexOf(node);
        if (nodeIndex < 0) {
            throw new Error('Invalid node specified: node.id=' + JSON.stringify(node.id));
        }

        // Check if the closeNode action can be performed
        if (this.state.openNodes.indexOf(node) < 0) {
            return false;
        }

        // Keep selected node unchanged if "node" is equal to "this.state.selectedNode"
        if (this.state.selectedNode && (this.state.selectedNode !== node)) {
            // Action:
            //   close "node.0.0"
            //
            // Tree:
            // [0] - node.0
            // [1]  - node.0.0      => next selected node (index=1, total=2)
            // [2]      node.0.0.0  => last selected node (index=2, total=0)
            // [3]      node.0.0.1
            // [4]    node.0.1
            const selectedIndex = this.nodes.indexOf(this.state.selectedNode);
            const rangeFrom = nodeIndex + 1;
            const rangeTo = nodeIndex + node.state.total;

            if ((rangeFrom <= selectedIndex) && (selectedIndex <= rangeTo)) {
                this.selectNode(node);
            }
        }

        node.state.open = false; // Set node.state.open to false
        const openNodes = this.state.openNodes.filter((node) => (node.state.more && node.state.open));
        this.state.openNodes = openNodes;

        const deleteCount = node.state.total;

        { // Traversing up through ancestors to subtract node.state.total.
            let p = node;
            while (p) {
                p.state.total = (p.state.total - deleteCount);
                p = p.parent;
            }
        }

        // Remove elements from an array
        this.nodes.splice(nodeIndex + 1, deleteCount);
        this.rows.splice(nodeIndex + 1, deleteCount);
        this.rows[nodeIndex] = rowRenderer(node);

        // Emit the 'closeNode' event
        this.emit('closeNode', node);

        // Updates list with new data
        this.update();

        return true;
    }
    // Gets a list of child nodes.
    // @param {object} [node] The object that defines the node. If null, returns a list of top level nodes.
    // @return {array} Returns an array of child nodes on success, null otherwise.
    getChildNodes(node = null) {
        if (node) {
            return node.children || [];
        }
        node = (this.nodes.length > 0) ? this.nodes[0] : null;
        while (node && node.parent !== null) {
            node = node.parent;
        }
        return node.children || [];
    }
    // Gets the first child node.
    // @param {object} [node] The object that defines the node.
    // @return {object} Returns the first child node on success, null otherwise.
    getFirstChildNode(node) {
        if (node && node.children && node.children.length > 0) {
            return node;
        }
        return null;
    }
    // Gets the next sibling node.
    // @param {object} [node] The object that defines the node.
    // @return {object} Returns the next sibling node on success, null otherwise.
    getNextSiblingNode(node) {
        if (node && node.parent && node.parent.children) {
            const index = node.parent.children.indexOf(node);
            if ((index >= 0) && (index < node.parent.children.length - 1)) {
                node = node.parent.children[index + 1];
                return node;
            }
        }
        return null;
    }
    // Gets a node by its unique id. This assumes that you have given the nodes in the data a unique id.
    // @param {string|number} id An unique node id. A null value will be returned if the id doesn't match.
    // @return {object} Returns the node the matches the id, null otherwise.
    getNodeById(id) {
        let node = this.tbl.get(id);
        if (!node) {
            // Find the first node that matches the id
            node = this.nodes.filter((node) => (node.id === id))[0];
            if (!node) {
                return null;
            }
            this.tbl.set(node.id, node);
        }
        return node;
    }
    // Gets the parent node.
    // @param {object} [node] The object that defines the node.
    // @return {object} Returns the parent node on success, null otherwise.
    getParentNode(node) {
        return (node && node.parent) || null;
    }
    // Gets previous sibling node.
    // @param {object} [node] The object that defines the node.
    // @return {object} Returns the previous sibling node on success, null otherwise.
    getPreviousSiblingNode(node) {
        if (node && node.parent && node.parent.children) {
            const index = node.parent.children.indexOf(node);
            if ((index > 0) && (index < node.parent.children.length)) {
                node = node.parent.children[index - 1];
                return node;
            }
        }
        return null;
    }
    // Gets the selected node.
    // @return {object} Returns the selected node, or null if not selected.
    getSelectedNode() {
        return this.state.selectedNode;
    }
    // Gets an array of open nodes.
    // @return {array} Returns an array of open nodes.
    getOpenNodes() {
        // returns a shallow copy of an array into a new array object.
        return this.state.openNodes.slice();
    }
    // Gets a boolean value indicating whether this node has any child nodes.
    // @param {object} node The object that defines the node.
    // @return {boolean} true if the node has child nodes; otherwise, false.
    hasChildNodes(node) {
        return !!(node && node.children && (node.children.length > 0));
    }
    // Loads data in the tree.
    // @param {object|array} data The data is an object or array of objects that defines the node.
    loadData(data = []) {
        const { autoOpen, rowRenderer } = this.options;

        this.nodes = flatten(data, { openAllNodes: autoOpen });

        // Clear lookup table
        this.tbl.clear();

        // Add nodes to the lookup table
        this.nodes.forEach((node) => {
            if (node.id !== undefined) {
                this.tbl.set(node.id, node);
            }
        });

        const openNodes = this.nodes.filter((node) => (node.state.more && node.state.open));
        this.state.openNodes = openNodes;
        this.state.selectedNode = null;

        this.rows = this.nodes.map(node => rowRenderer(node));

        // Updates list with new data
        this.update();
    }
    // Opens a node to display its children.
    // @param {object} node The object that defines the node.
    // @return {boolean} Returns true on success, false otherwise.
    openNode(node) {
        const { rowRenderer } = this.options;

        // Retrieve node index
        const nodeIndex = this.nodes.indexOf(node);
        if (nodeIndex < 0) {
            throw new Error('Invalid node specified: node.id=' + JSON.stringify(node.id));
        }

        // Check if the openNode action can be performed
        if (this.state.openNodes.indexOf(node) >= 0) {
            return false;
        }

        node.state.open = true; // Set node.state.open to true
        const openNodes = [node].concat(this.state.openNodes); // the most recently used items first
        this.state.openNodes = openNodes;

        const nodes = flatten(node.children, { openNodes: this.state.openNodes });
        const rows = nodes.map(node => rowRenderer(node));

        // Insert an array inside another array
        this.nodes.splice.apply(this.nodes, [nodeIndex + 1, 0].concat(nodes));
        this.rows.splice.apply(this.rows, [nodeIndex + 1, 0].concat(rows));
        this.rows[nodeIndex] = rowRenderer(node);

        // Add all child nodes to the lookup table if the first child does not exist in the lookup table
        if ((nodes.length > 0) && !(this.tbl.get(nodes[0]))) {
            nodes.forEach((node) => {
                if (node.id !== undefined) {
                    this.tbl.set(node.id, node);
                }
            });
        }

        // Emit the 'openNode' event
        this.emit('openNode', node);

        // Updates list with new data
        this.update();

        return true;
    }
    // Removes a node.
    // @param {object} node The object that defines the node.
    removeNode(node) {
        // TODO
    }
    // Sets the current scroll position to this node.
    // @param {object} node The object that defines the node.
    // @return {number} Returns the vertical scroll position, or -1 on error.
    scrollToNode(node) {
        // Retrieve node index
        const nodeIndex = this.nodes.indexOf(node);
        if (nodeIndex < 0) {
            return -1;
        }
        if (!this.contentElement) {
            return -1;
        }
        // Get the offset height of the first child element that contains the "tree-item" class.
        const firstChild = this.contentElement.querySelectorAll('.tree-item')[0];
        const rowHeight = (firstChild && firstChild.offsetHeight) || 0;
        return this.scrollTop(nodeIndex * rowHeight);
    }
    // Gets (or sets) the current vertical position of the scroll bar.
    // @param {number} [value] An integer that indicates the new position to set the scroll bar to.
    // @return {number} Returns the vertical scroll position.
    scrollTop(value) {
        if (!this.scrollElement) {
            return 0;
        }
        if (value !== undefined) {
            this.scrollElement.scrollTop = Number(value);
        }
        return this.scrollElement.scrollTop;
    }
    // Selects a node.
    // @param {object} node The object that defines the node. If null or undefined, deselects the current node.
    // @return {boolean} Returns true on success, false otherwise.
    selectNode(node = null) {
        const { rowRenderer } = this.options;

        if (node === null) {
            // Deselect the current node
            if (this.state.selectedNode) {
                const selectedNode = this.state.selectedNode;
                const selectedIndex = this.nodes.indexOf(selectedNode);

                selectedNode.state.selected = false;
                this.rows[selectedIndex] = rowRenderer(selectedNode);
                this.state.selectedNode = null;

                // Emit the 'selectNode' event
                this.emit('selectNode', null);

                // Updates list with new data
                this.update();

                return true;
            }

            return false;
        }

        // Retrieve node index
        const nodeIndex = this.nodes.indexOf(node);
        if (nodeIndex < 0) {
            throw new Error('Invalid node specified: node.id=' + JSON.stringify(node.id));
        }

        // Select this node
        if (this.state.selectedNode !== node) {
            node.state.selected = true;
            this.rows[nodeIndex] = rowRenderer(node);
        }

        // Deselect the current node
        if (this.state.selectedNode) {
            const selectedNode = this.state.selectedNode;
            const selectedIndex = this.nodes.indexOf(selectedNode);
            selectedNode.state.selected = false;
            this.rows[selectedIndex] = rowRenderer(selectedNode);
        }

        if (this.state.selectedNode !== node) {
            this.state.selectedNode = node;

            // Emit the 'selectNode' event
            this.emit('selectNode', node);
        } else {
            this.state.selectedNode = null;

            // Emit the 'selectNode' event
            this.emit('selectNode', null);
        }

        // Updates list with new data
        this.update();

        return true;
    }
    // Toggles a node to display or hide its children.
    // @param {object} node The object that defines the node.
    toggleNode(node) {
        if (this.state.openNodes.indexOf(node) >= 0) {
            // close node
            this.closeNode(node);
        } else {
            // open node
            this.openNode(node);
        }
    }
    // Serializes the current state of a node to a JSON string.
    // @param {object} node The object that defines the node. If null, returns the whole tree.
    toString(node) {
        const traverse = (node) => {
            let s = '[';
            if (node && node.children) {
                for (let i = 0; i < node.children.length; ++i) {
                    let list = [];
                    s = s + '{';
                    Object.keys(node).forEach((key) => {
                        let value = node[key];
                        if (key === 'parent') { // ignore parent
                            return;
                        }
                        if (key === 'children') { // traverse child nodes
                            list.push('"' + key + '":' + traverse(node.children[i]));
                            return;
                        }
                        if (typeof value === 'string' || typeof value === 'object') {
                            list.push('"' + key + '":' + JSON.stringify(value));
                        } else { // primitive types
                            list.push('"' + key + '":' + value);
                        }
                    });
                    s = s + list.join(',');
                    s = s + '}' + ((i === node.children.length - 1) ? '' : ',');
                }
            }
            s = s + ']';
            return s;
        };

        if (!node) {
            node = (this.nodes.length > 0) ? this.nodes[0] : null;
            while (node && node.parent !== null) {
                node = node.parent;
            }
        }

        return traverse(node);
    }
    // Performs full tree traversal using child-parent link, and returns an array of nodes.
    // This is the most elegant way of traversing a tree — no recursion or stack is involved.
    // @param {object} rootNode The object that defines the root node.
    // @return {array} Returns an array of nodes, including the root node.
    traverse(rootNode) {
        const list = [rootNode];

        // Ignore root node
        let node = this.getFirstChildNode(rootNode);
        while (node) {
            list.push(node);
            if (this.hasChildNodes(node)) {
                node = this.getFirstChildNode(node);
            } else {
                // find the parent level
                while ((this.getNextSiblingNode(node) === null) && (node !== rootNode)) {
                    // use child-parent link to get to the parent level
                    node = this.getParentNode(node);
                }

                // Get next sibling
                node = this.getNextSiblingNode(node);
            }
        }

        return list;
    }
    // Updates the data of a node.
    // @param {object} node
    // @param {object} data The data object.
    updateNode(node, data) {
        const { rowRenderer } = this.options;

        // Retrieve node index
        const nodeIndex = this.nodes.indexOf(node);
        if (nodeIndex < 0) {
            throw new Error('Invalid node specified: node.id=' + JSON.stringify(node.id));
        }

        // The static attributes (i.e. children, parent, and state) are being protected
        const { children, parent, state } = node;
        node = extend(node, data, { children, parent, state });

        this.rows[nodeIndex] = rowRenderer(node);

        // Updates list with new data
        this.update();
    }
}

module.exports = InfiniteTree;
