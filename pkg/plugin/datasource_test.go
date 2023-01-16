package plugin_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/machbase/booter"
	. "github.com/machbase/neo/pkg/plugin"

	_ "github.com/machbase/cemlib/banner"
	_ "github.com/machbase/cemlib/logging"
	_ "github.com/machbase/neo-server/mods/server"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func TestQueryData(t *testing.T) {
	dsOpt := DatasourceOptions{
		Address: "tcp://127.0.0.1:5655",
	}
	dsOptJson, err := json.Marshal(dsOpt)
	if err != nil {
		panic(err)
	}

	dsInst, err := NewDatasource(backend.DataSourceInstanceSettings{JSONData: dsOptJson})
	if err != nil {
		panic(err)
	}

	ds := dsInst.(*Datasource)

	qm := QueryModel{
		SqlText: "select time, name, value from sample",
	}

	js, err := json.Marshal(qm)
	if err != nil {
		panic(err)
	}

	resp, err := ds.QueryData(
		context.Background(),
		&backend.QueryDataRequest{
			Queries: []backend.DataQuery{
				{
					RefID: "A",
					JSON:  js,
				},
			},
		},
	)
	if err != nil {
		t.Error(err)
	}

	if len(resp.Responses) != 1 {
		t.Fatal("QueryData must return a response")
	}
	t.Logf("response.0 len=%d", resp.Responses["A"].Frames[0].Fields[0].Len())
}

func TestMain(m *testing.M) {
	builder := booter.NewBuilder()
	b, err := builder.BuildWithContent(serverConf)
	if err != nil {
		panic(err)
	}
	err = b.Startup()
	if err != nil {
		panic(err)
	}

	m.Run()
	b.Shutdown()
}

var serverConf = []byte(`
define VARS {
	WORKDIR = "../tmp"
}

module "github.com/machbase/cemlib/logging" {
    config {
        Console                     = false
        Filename                    = "-"
        DefaultPrefixWidth          = 30
        DefaultEnableSourceLocation = true
        DefaultLevel                = "TRACE"
        Levels = [
            { Pattern="machsvr", Level="TRACE" },
        ]
    }
}

module "machbase.com/neo-server" {
    name = "machsvr"
    config {
        MachbaseHome     = "${VARS_WORKDIR}/machbase"
        Machbase = {
            HANDLE_LIMIT = 1024
        }
        Grpc = {
            Listeners        = [ 
                "unix://${VARS_WORKDIR}/mach.sock", 
                "tcp://127.0.0.1:4056",
            ]
            MaxRecvMsgSize   = 4
            MaxSendMsgSize   = 4
        }
        Http = {
            Listeners        = [ "tcp://127.0.0.1:4088" ]
            Handlers         = [
                { Prefix: "/db",       Handler: "machbase" },
                { Prefix: "/metrics",  Handler: "influx" },
				{ Prefix: "/logvault", Handler: "logvault"},
            ]
        }
        Mqtt = {
            Listeners        = [ "tcp://127.0.0.1:4083"]
            Handlers         = [
                { Prefix: "db",      Handler: "machbase" },
                { Prefix: "metrics", Handler: "influx" },
            ]
        }
    }
}
`)
