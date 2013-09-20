/*
 * Combobox stores
 */
tvheadend.idnode_enum_stores = {}

tvheadend.idnode_get_enum = function ( conf )
{
  /* Build key */
  var key = conf.url;
  if (conf.params)
    key += '?' + Ext.util.JSON.encode(conf.params);
  if (conf.event)
    key += '+' + conf.event;

  /* Use cached */
  if (key in tvheadend.idnode_enum_stores)
    return tvheadend.idnode_enum_stores[key];

  /* Build combobox */
  var st = new Ext.data.JsonStore({
    root       : conf.root   || 'entries',
    url        : conf.url,
    baseParams : conf.params || {},
    fields     : conf.fields || [ 'key', 'val' ],
    id         : conf.id     || 'key',
    autoLoad   : true,
    sortInfo   : {
      field     : 'val',
      direction : 'ASC'
    }
  });
  tvheadend.idnode_enum_stores[key] = st;

  /* Event to update */
  if (conf.event) {
    tvheadend.comet.on(conf.event, function(){
      st.reload();
    });
  }

  return st;
}

json_decode = function(d)
{
  if (d && d.responseText) {
    d = Ext.util.JSON.decode(d.responseText)
    if (d.entries)
      d = d.entries;
    if (d.nodes)
      d = d.nodes;
  } else {
    d = []
  }
  return d;
}

/*
 * Build enum data store
 */
tvheadend.idnode_enum_store = function(f)
{
  var store = null;

  /* API fetch */
  if (f.enum.type == 'api') {
    return tvheadend.idnode_get_enum({
      url    : 'api/' + f.enum.uri,
      params : f.enum.params,
      event  : f.enum.event
    });
  }

  switch (f.type) {
    case 'str':
      if (f.enum.length > 0 && f.enum[0] instanceof Object)
        store = new Ext.data.JsonStore({
          id      : 'key',
          fields  : [ 'key', 'val' ],
          data    : f.enum,
        });
      else
        store = f.enum;
      break;
    case 'int':
    case 'u32':
    case 'u16':
    case 'dbl':
      var data  = null;
      if (f.enum.length > 0 && f.enum[0] instanceof Object) {
        data = f.enum;
      } else {
        data = []
        for ( i = 0; i < f.enum.length; i++ )
          data.push({ key: i, val: f.enum[i]});
      }
      store = new Ext.data.JsonStore({
        id     : 'key',
        fields : [ 'key', 'val' ],
        data   : data
      });
      break;
  }
  return store;
}

tvheadend.IdNodeField = function (conf)
{
  /*
   * Properties
   */
  this.id     = conf.id;
  this.text   = conf.caption || this.id;
  this.type   = conf.type;
  this.list = conf.list;
  this.rdonly = conf.rdonly;
  this.wronly = conf.wronly;
  this.wronce = conf.wronce;
  this.enum   = conf.enum;
  this.store  = null;
  if (this.enum)
    this.store = tvheadend.idnode_enum_store(this);

  /*
   * Methods
   */

  this.column = function ()
  {
    var ftype = 'string';
    if (this.type == 'int' || this.type == 'u32' || 
        this.type == 'u16' || this.type == 'dbl')
      ftype = 'numeric';
    else if (this.type == 'bool')
      ftype = 'boolean'
    return {
      dataIndex: this.id,
      header   : this.text,
      sortable : true,
      editor   : this.editor({create: false}),
      renderer : this.renderer(),
      filter   : {
        type      : ftype,
        dataIndex : this.id
      }
    };
  }

  this.renderer = function ()
  {
    if (!this.store)
      return null;

    var st = this.store;
    return function (v) {
      if (st && st.find) {
        var t = []
        var d;
        if (v.push)
          d = v;
        else
          d = [ v ];
        for (var i = 0; i < d.length; i++) {
          var r = st.find('key', d[i]);
          if (r != -1) {
            var nv = st.getAt(r).get('val');
            if (nv)
              t.push(nv);
          }
        }
        v = t.join(',');
      }
      return v;
    };
  }

  this.editor   = function (conf)
  {
    var cons = null;

    /* Editable? */
    var d = this.rdonly;
    if (this.wronly && !conf.create)
      d = false;

    /* Basic */
    var c = {
      fieldLabel : this.text,
      name       : this.id,
      value      : conf.value || null,
      disabled   : d,
      width      : 300,
    };

    /* ComboBox */
    if (this.enum) {
      cons = Ext.form.ComboBox;
      if (this.list)
        cons = Ext.ux.form.LovCombo;

      /* Combo settings */
      c['mode']           = 'local';
      c['valueField']     = 'key';
      c['displayField']   = 'val';
      c['store']          = this.store;
      c['typeAhead']      = true;
      c['forceSelection'] = false;
      c['triggerAction']  = 'all',
      c['emptyText']      = 'Select ' + this.text + ' ...';
    
    /* Single */
    } else {
      switch (this.type) {
        case 'bool':
          cons = Ext.form.Checkbox;
        break;

        case 'int':
        case 'u32':
        case 'u16':
        case 'dbl':
          cons = Ext.form.NumberField;
          break;

        default:
          cons = Ext.form.TextField;
          break;
      }
    }

    return new cons(c);
  }
}

/*
 * IdNode
 */
tvheadend.IdNode = function (conf)
{
  /*
   * Properties
   */
  this.clazz  = conf.class;
  this.text   = conf.caption || this.clazz;
  this.props  = conf.props;
  this.fields = []
  for (var i = 0; i < this.props.length; i++) {
    this.fields.push(new tvheadend.IdNodeField(this.props[i]));
  }

  /*
   * Methods
   */

  this.length = function () {
    return this.fields.length;
  }
}


/*
 * Field editor
 */
tvheadend.idnode_editor_field = function(f, create)
{
  var d = f.rdonly || false;
  if (f.wronly && !create) d = false;
    
  /* Enumerated (combobox) type */
  if (f.enum) {
    var cons = Ext.form.ComboBox;
    if (f.list)
      cons = Ext.ux.form.LovCombo;
    return new cons({
      fieldLabel      : f.caption,
      name            : f.id,
      value           : f.value,
      disabled        : d,
      width           : 300,
      mode            : 'local',
      valueField      : 'key',
      displayField    : 'val',
      store           : tvheadend.idnode_enum_store(f),
      typeAhead       : true, // TODO: this does strange things in multi
      forceSelection  : false,
      triggerAction   : 'all',
      emptyText       :'Select ' + f.caption +' ...'
    });
    /* TODO: listeners for regexp?
    listeners       : { 
      keyup: function() {
        this.store.filter('val', this.getRawValue(), true, false);
      },
      beforequery: function(queryEvent) {
        queryEvent.combo.onLoad();
        // prevent doQuery from firing and clearing out my filter.
        return false; 
      }
    }
    */
  }

  /* Singular */
  switch(f.type) {
    case 'str':
      return new Ext.form.TextField({
        fieldLabel  : f.caption,
        name        : f.id,
        value       : f.value,
        disabled    : d,
        width       : 300
      });
      break;

    case 'bool':
      return new Ext.form.Checkbox({
        fieldLabel  : f.caption,
        name        : f.id,
        checked     : f.value,
        disabled    : d
      });
      break;

    case 'int':
    case 'u32':
    case 'u16':
    case 'dbl':
      return new Ext.form.NumberField({
        fieldLabel  : f.caption,
        name        : f.id,
        value       : f.value,
        disabled    : d,
        width       : 300
      });
      break;
  }
  return null;
}

/*
 * ID node editor panel
 */
tvheadend.idnode_editor = function(item, conf)
{
  var panel  = null;
  var fields = []

  for (var idx in item.params) {
    var f = tvheadend.idnode_editor_field(item.params[idx], true);
    if (f)
      fields.push(f);
  }

  /* Buttons */
  var saveBtn = new Ext.Button({
    text  : 'Save',
    handler     : function() {
      var node = panel.getForm().getFieldValues();
      node.uuid  = item.uuid;
      Ext.Ajax.request({
        url      : 'api/idnode/save',
        params   : {
          node: Ext.encode(node)
        },
        success : function(d) {
        }
      });
    }
  });

  panel = new Ext.FormPanel({
    title       : conf.title || null,
    frame       : true,
    border      : true,
    bodyStyle   : 'padding: 5px',
    labelAlign  : 'left',
    labelWidth  : 200,
    autoWidth   : true,
    autoHeight  : !conf.fixedHeight,
    width  : 600,
    //defaults: {width: 330},
    defaultType : 'textfield',
    buttonAlign : 'left',
    items       : fields,
    buttons     : [ saveBtn ]
  });
  return panel;
}


/*
 * IDnode creation dialog
 */
tvheadend.idnode_create = function(conf)
{
  var puuid  = null;
  var panel  = null;
  var pclass = null;

  /* Buttons */
  var saveBtn = new Ext.Button({
    tooltip     : 'Create new entry',
    text        : 'Create',
    hidden      : true,
    handler     : function(){
      params = conf.create.params || {}
      if (puuid)
        params['uuid'] = puuid;
      if (pclass)
        params['class'] = pclass
      params['conf'] = Ext.encode(panel.getForm().getFieldValues());
      Ext.Ajax.request({
        url    : conf.create.url || conf.url + '/create',
        params : params,
        success : function(d) {
          win.close();
        }
      });
    }
  });
  var undoBtn = new Ext.Button({
    tooltip     : 'Cancel operation',
    text        : 'Cancel',
    handler     : function(){
      win.close();
    }
  });

  /* Form */
  panel = new Ext.FormPanel({
    frame       : true,
    border      : true,
    bodyStyle   : 'padding: 5px',
    labelAlign  : 'left',
    labelWidth  : 200,
    autoWidth   : true,
    autoHeight  : true,
    defaultType : 'textfield',
    buttonAlign : 'left',
    items       : [],
    buttons     : [ undoBtn, saveBtn ]
  });

  /* Create window */
  win = new Ext.Window({
    title       : 'Add ' + conf.titleS,
    layout      : 'fit',
    autoWidth   : true,
    autoHeight  : true,
    plain       : true,
    items       : panel
  });

  /*
   * Build the edit panel
   */
  function build_form (d)
  {
    saveBtn.setVisible(true);

    /* Fields */
    for (i = 0; i < d.length; i++) {
      var f = tvheadend.idnode_editor_field(d[i]);
      if (f)
        panel.add(f);
    }
    panel.doLayout();
  }

  /* Do we need to first select a class? */
  if (conf.select) {
    var store = conf.select.store;
    if (!store) {
      store = new Ext.data.JsonStore({
        root        : 'entries',
        url         : conf.select.url || conf.url,
        baseParams  : conf.select.params,
        fields      : [ conf.select.valueField, conf.select.displayField ]
      });
    }
    var select = null;
    if (conf.select.propField) {
      select = function (s, n, o) {
        var r =  store.getAt(s.selectedIndex);
        if (r) {
          var d = r.get(conf.select.propField);
          if (d) {
            pclass = r.get(conf.select.valueField);
            win.setTitle('Add ' + s.lastSelectionText);
            panel.remove(s);
            build_form(d);
          }
        }
      }
    } else {
      select = function (s, n, o) {
        params = conf.select.clazz.params || {};
        params['uuid'] = puuid = n.id;
        Ext.Ajax.request({
          url     : conf.select.clazz.url || conf.select.url || conf.url,
          success : function(d) {
            panel.remove(s);
            d = json_decode(d);
            build_form(d.props);
          },
          params  : params
        });
      };
    }

    /* Parent selector */
    var combo = new Ext.form.ComboBox({
      fieldLabel    : conf.select.label,
      grow          : true,
      editable      : false,
      allowBlank    : false,
      displayField  : conf.select.displayField,
      valueField    : conf.select.valueField,
      mode          : 'remote',
      triggerAction : 'all',
      store         : store,
      listeners     : {
        select : select
      }
    });

    panel.add(combo);
    win.show();
  } else {
    Ext.Ajax.request({
      url     : conf.url + '/class',
      params  : conf.params,
      success : function(d) {
        d = json_decode(d);
        build_form(d.props);
        win.show();
      }
    });
  }
}


/*
 * IDnode grid
 */
tvheadend.idnode_grid = function(panel, conf)
{
  function build (d)
  {
    var columns = conf.lcol || [];
    var filters = [];
    var fields  = [];
    var buttons = [];
    var saveBtn = null;
    var undoBtn = null;
    var addBtn  = null;
    var delBtn  = null;
    var editBtn = null;

    /* Model */
    var idnode  = new tvheadend.IdNode(d);
    for (var i = 0; i < idnode.length(); i++) {
      var f = idnode.fields[i];
      var c = f.column();
      fields.push(f.id);
      columns.push(c);
      if (c.filter)
        filters.push(c.filter);
    }

    /* Right-hand columns */
    if (conf.rcol)
      for (i = 0; i < conf.rcol.length; i++) 
        columns.push(conf.rcol[i])

    /* Filters */
    var filter = new Ext.ux.grid.GridFilters({
      encode  : true,
      local   : false,
      filters : filters
    });

    /* Store */
    var store  = new Ext.data.JsonStore({
      root                 : 'entries',
      url                  : conf.url + '/grid',
      autoLoad             : true,
      id                   : 'uuid',
      totalProperty        : 'total',
      fields               : fields,
      remoteSort           : true,
      pruneModifiedRecords : true
    });

    /* Model */
    var model = new Ext.grid.ColumnModel({
      defaultSortable : true,
      columns         : columns
    });

    /* Selection */
    var select = new Ext.grid.RowSelectionModel({
      singleSelect    : false
    });

    /* Event handlers */
    store.on('update', function(s, r, o){
      var d = (s.getModifiedRecords().length == 0);
      undoBtn.setDisabled(d);
      saveBtn.setDisabled(d);
    });
    select.on('selectionchange', function(s){
      if (delBtn)
        delBtn.setDisabled(s.getCount() == 0);
      editBtn.setDisabled(s.getCount() != 1);
    });

    /* Top bar */
    saveBtn = new Ext.Toolbar.Button({
      tooltip     : 'Save pending changes (marked with red border)',
      iconCls     : 'save',
      text        : 'Save',
      disabled    : true,
      handler     : function(){
        var mr  = store.getModifiedRecords();
        var out = new Array();
        for (var x = 0; x < mr.length; x++) {
          v           = mr[x].getChanges();
          out[x]      = v;
          out[x].uuid = mr[x].id;
        }
        Ext.Ajax.request({
           url     : 'api/idnode/save',
           params  : {
             node: Ext.encode(out)
           },
           success : function(d)
           {
             if (!auto.getValue()) store.reload();
           }
        });
      }
    });
    buttons.push(saveBtn);
    undoBtn = new Ext.Toolbar.Button({
      tooltip     : 'Revert pending changes (marked with red border)',
      iconCls     : 'undo',
      text        : 'Undo',
      disabled    : true,
      handler     : function() {
        store.rejectChanges();
      }
    });
    buttons.push(undoBtn);
    buttons.push('-');
    if (conf.add) {
      addBtn  = new Ext.Toolbar.Button({
        tooltip     : 'Add a new entry',
        iconCls     : 'add',
        text        : 'Add',
        disabled    : false,
        handler     : function() {
          tvheadend.idnode_create(conf.add);
        }
      });
      buttons.push(addBtn);
    }
    if (conf.del) {
      delBtn  = new Ext.Toolbar.Button({
        tooltip     : 'Delete selected entries',
        iconCls     : 'remove',
        text        : 'Delete',
        disabled    : true,
        handler     : function() {
          var r = select.getSelections();
          if (r) {
            var uuids = []
            for ( var i = 0; i < r.length; i++ )
              uuids.push(r[i].id)
            Ext.Ajax.request({
              url     : 'api/idnode/delete',
              params  : {
                uuid: Ext.encode(uuids)
              },
              success : function(d)
              {
                if (!auto.getValue()) store.reload();
              }
            });
          }
        }
      });
      buttons.push(delBtn);
    }
    buttons.push('-');
    editBtn = new Ext.Toolbar.Button({
      tooltip     : 'Edit selected entry',
      iconCls     : 'edit',
      text        : 'Edit',
      disabled    : true,
      handler     : function() {
        var r = select.getSelected();
        if (r) {
          if (conf.edittree) {
            var p = tvheadend.idnode_tree({
              url     : 'api/idnode/tree',
              params  : {
                root : r.id
              }
            });
            p.setSize(800,600);
            var w = new Ext.Window({
              title       : 'Edit ' + conf.titleS,
              layout      : 'fit',
              autoWidth   : true,
              autoHeight  : true,
              plain       : true,
              items       : p
            });
            w.show();
          } else {
            Ext.Ajax.request({
              url     : 'api/idnode/load',
              params  : {
                uuid: r.id
              },
              success : function(d)
              {
                d = json_decode(d);
                var p = tvheadend.idnode_editor(d[0], {});
                var w = new Ext.Window({
                  title       : 'Edit ' + conf.titleS,
                  layout      : 'fit',
                  autoWidth   : true,
                  autoHeight  : true,
                  plain       : true,
                  items       : p
                });
                w.show();
              }
            });
          }
        }
      }
    });
    buttons.push(editBtn);

    /* Extra buttons */
    if (conf.tbar) {
      buttons.push('-')
      for (i = 0; i < conf.tbar.length; i++)
        buttons.push(conf.tbar[i])
    }

    /* Help */
    if (conf.help) {
      buttons.push('->');
      buttons.push({  
        text    : 'Help',
        handler : conf.help
      });
    }

    /* Grid Panel */
    var auto   = new Ext.form.Checkbox({
      checked     : true,
      listeners   : {
        check : function ( s, c ) {
          if (c) store.reload();
        }
      }
    });
    var count  = new Ext.form.ComboBox({
      width          : 50,
      displayField   : 'val',
      valueField     : 'key',
      store          : new Ext.data.ArrayStore({
        id     : 0,
        fields : [ 'key', 'val' ],
        data   : [[25, '25'], [50, '50'], [100, '100'],
                  [200, '200'], [-1, 'All']]
      }),
      value          : 50,
      mode           : 'local',
      forceSelection : false,
      triggerAction  : 'all',
      listeners      : {
        select : function (s, r) {
          if (r != page.pageSize) {
            page.pageSize = r.id;
            store.reload();
            page.changePage(0);
            // TODO: currently setting pageSize=-1 to disable paging confuses
            //       the UI elements, and I don't know how to sort that!
          }
        }
      }
    });
    var page = new Ext.PagingToolbar({
      store       : store,
      pageSize    : 50,
      displayInfo : true,
      displayMsg  :  conf.titleP + ' {0} - {1} of {2}',
      emptyMsg    : 'No ' + conf.titleP.toLowerCase() + ' to display',
      items       : [ '-', 'Auto-refresh', auto,
                      '->', '-', 'Per page', count ]
    });
    var grid   = new Ext.grid.EditorGridPanel({
      stripeRows    : true,
      title         : conf.titleP,
      store         : store,
      cm            : model,
      selModel      : select,
      plugins       : [
        filter
      ],
      viewConfig    : {
        forceFit : true
      },
      tbar          : buttons,
      bbar          : page
    });
    panel.add(grid);

    /* Add comet listeners */
    var update = function(o) {
      if (auto.getValue())
        store.reload();
    };
    if (conf.comet)
      tvheadend.comet.on(conf.comet, update);
    tvheadend.comet.on('idnodeUpdated', update);
    tvheadend.comet.on('idnodeDeleted', update);
  }

  /* Request data */
  if (!conf.fields) {
    Ext.Ajax.request({
      url     : conf.url + '/class',
      success : function(d)
      {
        var d = json_decode(d);
        build(d);
      }
    });
  } else {
    build(conf.fields);
  }
}

tvheadend.idnode_tree = function (conf)
{
  var current = null;
  var params  = conf.params || {};
  var loader = new Ext.tree.TreeLoader({
    dataUrl         : conf.url,
    baseParams      : params,
    preloadChildren : conf.preload,
    nodeParameter   : 'uuid'
  });

  var tree = new Ext.tree.TreePanel({
    loader  : loader,
    flex    : 1,
    border  : false,
    root    : new Ext.tree.AsyncTreeNode({
      id    : conf.root  || 'root',
      text  : conf.title || ''
    }),
    listeners : {
      click: function(n) {
        if(current)
          panel.remove(current);
        if(!n.isRoot)
          current = panel.add(new tvheadend.idnode_editor(n.attributes, {
            title       : 'Parameters',
            fixedHeight : true
          }));
        panel.doLayout();
      }
    }
  });

  // TODO: top-level reload
  tvheadend.comet.on('idnodeUpdated', function(o) {
    var n = tree.getNodeById(o.uuid);
    if (n) {
      if (o.text) n.setText(o.text);
      tree.getRootNode().reload();
      // cannot get this to properly reload children and maintain state
    }
  });


  var panel = new Ext.Panel({
    title          : conf.title || '',
    layout        : 'hbox',
    flex          : 1,
    padding        : 5,
    border        : false,
    layoutConfig  : {
      align : 'stretch'
    },
    items: [ tree ]
  });


  tree.on('render', function() {
    tree.getRootNode().expand();
  });

  return panel;
}
