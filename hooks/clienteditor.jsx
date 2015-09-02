var _               = require('lodash');
var bs              = require('react-bootstrap');
var CodeMirror      = require('react-code-mirror');
var ConfirmAction   = require('../lib/ui/confirmaction');
var DateTimePicker  = require('react-widgets').DateTimePicker;
var debug           = require('debug')('hookeditor');
var format          = require('../lib/format');
var Promise         = require('promise');
var React           = require('react');
var slugid          = require('slugid');
var taskcluster     = require('taskcluster-client');
var utils           = require('../lib/utils');

var initialTask = {
  provisionerId:      'aws-provisioner-v1',
  workerType:         'b2gtest',
  created:            null, // later
  deadline:           null, // later
  payload: {
    image:            'ubuntu:13.10',
    command:          ['/bin/bash', '-c', 'echo "hello World"'],
    maxRunTime:       60 * 10
  },
  metadata: {
    name:             "Example Task",
    description:      "Markdown description of **what** this task does",
    owner:            "name@example.com",
    source:           "http://tools.taskcluster.net/task-creator/"
  }
};

var reference = require('./reference');
/** Create client editor/viewer (same thing) */
var ClientEditor = React.createClass({
  /** Initialize mixins */
  mixins: [
    utils.createTaskClusterMixin({
      clients: {
        hooks:       taskcluster.createClient(reference)
      },
      reloadOnProps: ['currentHookId', 'currentGroupId']
    })
  ],

  propTypes: {
    // Method to refresh client list
    refreshClientList:  React.PropTypes.func.isRequired
  },

  getDefaultProps: function() {
    return {
      currentHookId:  undefined,     // undefined implies. "Create Client"
      currentGroupId: undefined,
      localStorageKey: undefined,
      initialTaskValue: JSON.stringify(initialTask, null, '\t')
    };
  },

  getInitialState: function() {
    // Load from localStorage, otherwise initial task value
    var task = this.props.initialTaskValue;
    if (this.props.localStorageKey) {
      if (localStorage.getItem(this.props.localStorageKey)) {
        task = localStorage.getItem(this.props.localStorageKey);
        // Check if it'll parse
        try {
          JSON.parse(task);
        }
        catch(err) {
          task = this.props.initialTaskValue;
        }
      }
    }
    return _.defaults(this.parameterizeTask(task), {
      // Loading client or loaded client
      clientLoaded:     false,
      clientError:      undefined,
      client:           undefined,
      // Edit or viewing current state
      editing:          true,
      // Operation details, if currently doing anything
      working:          false,
      error:            null
    });
  },

  /** Parameterize a task, return state after parameterization attempt */
  parameterizeTask(task) {
    // Assume the is valid JSON
    var invalidTask = false;

    // Parameterize with new deadline and created time
    try {
      var data      = JSON.parse(task);
      var deadline  = new Date();
      deadline.setMinutes(deadline.getMinutes() + 60);
      data.created  = new Date().toJSON();
      data.deadline = deadline.toJSON();
      task          = JSON.stringify(data, null, '\t');
    }
    catch (err) {
      debug("Failed to parameterize initial task, err: %s, %j",
            err, err, err.stack);
      invalidTask = true;
    }

    // Set task, and serialize to string after parameterization
    return {
      task:         task,
      invalidTask:  invalidTask
    };
  },

  /** Load initial state */
  load: function() {
    // If there is no currentClientId, we're creating a new client
    if (!this.props.currentHookId || !this.props.currentGroupId) {
      return {
        client:            {
          groupId:         this.props.currentGroupId ? this.props.currentGroupId :  "",
          hookId:          this.props.currentHookId ? this.props.currentHookId :    "",
          deadline:        "",
          expires:         "",
          schedule:        "",
          metadata:        {
            name:          "",
            description:   "",
            owner:         "",
            emailOnError:  true
          },
          task:            initialTask
        },
        editing:           true,
        working:           false,
        error:             null
      };
    } else {
      // Load currentClientId
      var hookDef = this.hooks.hook(this.props.currentGroupId, this.props.currentHookId);
      return {
        client:           hookDef,
        task:             JSON.stringify(hookDef.task, null, '\t'),
        invalidTask:      false,
        editing:          false,
        working:          false,
        error:            null
      };
    }
  },

  render: function() {
    // display errors from operations
    if (this.state.error) {
      return (
        <bs.Alert bsStyle="danger" onDismiss={this.dismissError}>
          <strong>Error executing operation</strong>
          {this.state.error.toString()}
        </bs.Alert>
      );
    }
    var isCreating          = (this.props.currentClientId === undefined ||
                               this.props.currentGroupId  === undefined);
    var isEditing           = (isCreating || this.state.editing);
    var title               = "Create New Hook";
    if (!isCreating) {
      title = (isEditing ? "Edit Hook" : "View Hook");
    }
    return this.renderWaitFor('client') || (
      <span className="client-editor">
        <h3>{title}</h3>
        <hr style={{marginBottom: 10}}/>
        <div className="form-horizontal">
          <div className="form-group">
            <label className="control-label col-md-3">GroupId</label>
            <div className="col-md-9">
                {
                  isEditing ?
                    <input type="text"
                      className="form-control"
                      ref="groupId"
                      value={this.state.client.groupId}
                      onChange={this.onChange}
                      placeholder="groupId"/>
                  :
                    <div className="form-control-static">
                      {this.state.client.groupId}
                    </div>
                }
            </div>
          </div>
          <div className="form-group">
            <label className="control-label col-md-3">HookId</label>
            <div className="col-md-9">
                {
                  isEditing ?
                    <input type="text"
                      className="form-control"
                      ref="hookId"
                      value={this.state.client.hookId}
                      onChange={this.onChange}
                      placeholder="hookId"/>
                  :
                    <div className="form-control-static">
                      {this.state.client.hookId}
                    </div>
                }
            </div>
          </div>
          <div className="form-group">
            <label className="control-label col-md-3">Name</label>
            <div className="col-md-9">
                {
                  isEditing ?
                    <input type="text"
                      className="form-control"
                      ref="name"
                      value={this.state.client.metadata.name}
                      onChange={this.onChange}
                      placeholder="Name"/>
                  :
                    <div className="form-control-static">
                      {this.state.client.metadata.name}
                    </div>
                }
            </div>
          </div>
          <div className="form-group">
            <label className="control-label col-md-3">Description</label>
            <div className="col-md-9">
              {isEditing ? this.renderDescEditor() : this.renderDesc()}
            </div>
          </div>
          <div className="form-group">
            <label className="control-label col-md-3">Task</label>
            <div className="col-md-9">
              { this.renderEditor() }
            </div>
          </div>
          <div className="form-group">
            <label className="control-label col-md-3">Expires</label>
            <div className="col-md-9">
              {
                isEditing ?
                  <input type="text"
                    className="form-control"
                    ref="expires"
                    value={this.state.client.expires}
                    onChange={this.onChange}
                    placeholder="Name"/>
                  :
                    <div className="form-control-static">
                      {this.state.client.expires}
                    </div>
                }
              </div>
            </div>
            <div className="form-group">
              <div className="col-md-9 col-md-offset-3">
                <div className="form-control-static">
                  {
                    isEditing ?
                      (isCreating ?
                        this.renderCreatingToolbar()
                      :
                        this.renderEditingToolbar()
                      )
                    :
                      <bs.ButtonToolbar>
                        <bs.Button bsStyle="success"
                          onClick={this.startEditing}
                          disabled={this.state.working}>
                          <bs.Glyphicon glyph="pencil"/>&nbsp;Edit Client
                        </bs.Button>
                      </bs.ButtonToolbar>
                    }
                  </div>
                </div>
              </div>
            </div>
          </span>
    );
  },

 /** Render editing toolbar */
  renderEditingToolbar() {
    return (
      <bs.ButtonToolbar>
        <bs.Button bsStyle="success"
                   onClick={this.saveClient}
                   disabled={this.state.working || this.state.invalidTask}>
          <bs.Glyphicon glyph="ok"/>&nbsp;Save Changes
        </bs.Button>
        <ConfirmAction
          buttonStyle='danger'
          glyph='trash'
          disabled={this.state.working}
          label="Delete Client"
          action={this.deleteClient}
          success="Client deleted">
          Are you sure you want to delete credentials with clientId&nbsp;
          <code>{this.state.client.clientId}</code>?
        </ConfirmAction>
      </bs.ButtonToolbar>
    );
  },

  /** Render creation toolbar */
  renderCreatingToolbar: function() {
    return (
      <bs.ButtonToolbar>
        <bs.Button bsStyle="primary"
                   onClick={this.createClient}
                   disabled={this.state.working || this.state.invalidTask}>
          <bs.Glyphicon glyph="plus"/>&nbsp;Create Client
        </bs.Button>
      </bs.ButtonToolbar>
    );
  },

  /** Render description editor */
  renderDescEditor: function() {
    return (
      <textarea className="form-control"
                ref="description"
                value={this.state.client.metadata.description}
                onChange={this.onChange}
                rows={8}
                placeholder="Description in markdown...">
      </textarea>
    );
  },

  /** Render description */
  renderDesc: function() {
    return (
      <div className="form-control-static">
        <format.Markdown>{this.state.client.metadata.description}</format.Markdown>
      </div>
    );
  },

  /** Render task editor */
  renderEditor() {
    return (
      <span>
      <CodeMirror
        ref="editor"
        lineNumbers={true}
        mode="application/json"
        textAreaClassName={'form-control'}
        value={this.state.task}
        onChange={this.onTaskChange}
        indentWithTabs={true}
        tabSize={2}
        lint={true}
        gutters={["CodeMirror-lint-markers"]}
        theme="neat"/>
    </span>
    );
  },

  onTaskChange: function(e) {
    var invalidTask = false;
    try {
      JSON.parse(e.target.value);
    }
    catch(err) {
      invalidTask = true;
    }
    this.setState({
      task:         e.target.value,
      invalidTask:  invalidTask
    });
  },

  /** Handle changes in the editor */
  onChange: function() {
    var state = _.cloneDeep(this.state);
    state.client.groupId               = this.refs.groupId.getDOMNode().value;
    state.client.hookId                = this.refs.hookId.getDOMNode().value;
    state.client.metadata.description  = this.refs.description.getDOMNode().value;
    state.client.metadata.name         = this.refs.name.getDOMNode().value;
    state.client.expires               = this.refs.expires.getDOMNode().value;
    this.setState(state);
  },

  /** When expires exchanges in the editor */
  onExpiresChange: function(date) {
    if (date instanceof Date) {
      var state = _.cloneDeep(this.state);
      state.client.expires = date.toJSON();
      this.setState(state);
    }
  },

  /** Start editing */
  startEditing: function() {
    this.setState({editing: true});
  },

  /** Create the hook definition */
  createDefinition() {
    return {
      metadata: this.state.client.metadata,
      task:     JSON.parse(this.state.task),
      deadline: this.state.client.expires,
      expires:  this.state.client.expires,
    };
  },

  /** Create new client */
  createClient: function() {
    this.setState({working: true});
    this.hooks.createHook(
      this.state.client.groupId,
      this.state.client.hookId,
      this.createDefinition()
    ).then(function(hook) {
      this.setState({
        client: hook,
        editing: false,
        working: false,
        error: null
      });
      this.props.refreshClientList();
      //this.reload();
    }.bind(this), function(err) {
      this.setState({
        working:  false,
        error:    err
      });
    }.bind(this));
  },

  /** Save current client */
  saveClient() {
    this.loadState({
      client: this.hooks.updateHook(
        this.state.client.groupId,
        this.state.client.hookId,
        this.createDefinition()
      ),
      editing: false
    });
  },

  /** Delete current client */
  async deleteClient() {
    await this.hooks.removeHook(this.state.client.groupId, this.state.client.hookId);
    await Promise.all([this.props.refreshClientList(), this.reload()]);
  },

  /** Reset error state from operation*/
  dismissError() {
    this.setState({
      working:      false,
      error:        null
    });
  }
});

// Export ClientEditor
module.exports = ClientEditor;

