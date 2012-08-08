$(function() {
    var ROOT = new Firebase('http://gamma.firebase.com/firebase_news');
    var LINKS = ROOT.child('links');
    var USERS = ROOT.child('users');
    var COMMENT_INSET = 20;
    var stories = [];
    var expanded = [];
    var editing = null;

    var linkify = function(link) {
        var a = document.createElement('a');
        a.href = link;
        return a.href;
    }

    var handleSubmit = function(event) {
        var btn = $('#submit');
        btn.prop('disabled', true);
        var urlInput = $('#submit-url');
        var titleInput = $('#link-title');
        var link = linkify(urlInput.val());
        var title = titleInput.val() || link;
        urlInput.val('');
        titleInput.val('');
        var data = {
            title: title,
            link: link,
            user: thisUser.name,
            up: [thisUser.ref.toString()],
            down: [],
            comments: []
        };
        var story = LINKS.push(data);
        btn.prop('disabled', false);
    };

    var intCmp = function(a, b) {
        if (a > b) return -1;
        if (a == b) return 0;
        return 1;
    }

    var valWrapper = function(fn) {
        return function(a, b) {
            if (typeof(a.val) == 'function') {
                return fn(a.val(), b.val());
            } else {
                return fn(a, b);
            }
        }
    }

    var upvoteSort = function(a, b) {
        return intCmp((a.up || []).length, (b.up || []).length)
    };

    var totalSort = function(a, b) {
        return intCmp(
            (a.up || []).length - (a.down || []).length,
            (b.up || []).length - (b.down || []).length
        );
    };

    var sortScorable = function(scorables) {
        scorables.sort(valWrapper(totalSort));
    }

    var sortComments = function(comments) {
        var commentIndex = [];
        $.each(comments, function(index, comment) {
            commentIndex.push({
                i: index,
                up: comment.up || [],
                down: comment.down || []
            });
        });
        commentIndex.sort(totalSort);
        return commentIndex;
    };

    var ADD_COMMENT_TEMPLATE = _.template($('#add-comment-template').html());
    var COMMENT_TEMPLATE = _.template($('#comment-template').html());
    var renderCommentList = function(ul, comments, parentRef, offset) {
        var commentIndices = sortComments(comments);
        var commentsRef = parentRef.child('comments');
        for (var i = 0; i < commentIndices.length; ++i) {
            var cIndex = commentIndices[i];
            var comment = comments[cIndex.i];
            var refString = commentsRef.child(cIndex.i).toString();
            var li = $(COMMENT_TEMPLATE({
                refString: refString,
                username: thisUser && comment.user == thisUser.name ? "You" : comment.user,
                scoreWidget: scoreElement(comment),
                voteCount: voteCountElement(comment),
                text: comment.text,
                replyWidget: ADD_COMMENT_TEMPLATE({
                    editing: false,
                    canEdit: thisUser != null,
                    title: "Reply"
                })
            }));

            // add next thread
            var nextComments = comment['comments'] || [];
            var nextOffset = offset + 1;
            var nextUl = $('<ul/>');
            nextUl.css('margin-right', offset * COMMENT_INSET + 'px');
            renderCommentList(nextUl, nextComments, new Firebase(refString), nextOffset);
            li.append(nextUl);
            ul.append(li);
        }
    };

    var renderComments = function(div, story) {
        div.append($(ADD_COMMENT_TEMPLATE({
            editing: false,
            canEdit: thisUser != null,
            title: "Add Comment"
        })));
        var ul = $('<ul />');
        var comments = story.val().comments || [];
        renderCommentList(ul, comments, story.ref(), 0);
        /*var commentIndices = sortComments(comments);
        for (var i = 0; i < commentIndices.length; ++i) {
            var cIndex = commentIndices[i];
            var comment = comments[cIndex.i];
            var refString = story.ref().child('comments').child(cIndex.i).toString();
            li = $(COMMENT_TEMPLATE({
                refString: refString,
                username: thisUser && comment.user == thisUser.name ? "You" : comment.user,
                scoreWidget: scoreElement(comment),
                voteCount: voteCountElement(comment),
                text: comment.text,
                replyWidget: ADD_COMMENT_TEMPLATE({
                    editing: false,
                    canEdit: thisUser != null,
                    title: "Reply"
                })
            }));
            ul.append(li);
        }*/
        div.append(ul);
    };

    var showCommentsHandler = function(event) {
        event.preventDefault();
        var a = $(event.target);
        var li = a.closest('li');
        var refString = li.attr('id');
        toggleComments(refString);
    };

    var replySubmit = function(event) {
        var btn = $(event.target);
        var commentText = btn.siblings('.comment-text').val();
        var li = btn.closest('li');
        var refString = li.attr('id');
        var comment = {
            text: commentText,
            user: thisUser.name,
            up: [thisUser.ref.toString()]
        };
        addCommentToRef(refString, comment);
    };

    var replyHandler = function(event) {
        var li = $(event.target).closest('li');
        var div = li.find('div.new-comment').first();
        if (editing) {
            console.log('need to close old editors?');
        }
        editing = div;
        div.html(ADD_COMMENT_TEMPLATE({
            editing: true,
            canEdit: true,
            title: 'reply'
        }));
    };

    var toggleComments = function(refString) {
        var li = $('li[id="' + refString + '"]');
        var a = li.children('.comments-opener');
        if (a.hasClass('show-comments')) {
            // showing the comments
            a.removeClass('show-comments');
            a.addClass('hide-comments');
            a.text('Hide Comments');
            expanded.push(refString);
            var story = getStory(refString);
            var div = $('<div />');
            div.addClass('comments');
            li.append(div);
            renderComments(div, story);
        } else {
            // hiding the comments
            a.removeClass('hide-comments');
            a.addClass('show-comments');
            a.text('View Comments');
            li.children('div.comments').remove();
            expanded.splice(expanded.indexOf(refString), 1);
        }
    };

    var addCommentToRef = function(refString, comment) {
        new Firebase(refString).child('comments').transaction(function(commentList) {
            if (!commentList) {
                return [comment];
            } else {
                commentList.push(comment);
                return commentList;
            }
        }, function(success) {
            if (!success) console.warn('failed to make comment');
        });
    };

    var storyAdded = function(snapshot, prevChild) {
        stories.push(snapshot);
        render();
    };

    var storyChanged = function(snapshot, prevChild) {
        var index = stories.indexOf(getStory(snapshot.ref().toString()));
        stories.splice(index, 1, snapshot);
        render();
    };

    var callWithVotes = function(fn) {
        return function(scorable) {
            var up = scorable['up'] || [];
            var down = scorable['down'] || [];
            return fn(up, down);
        };
    }

    var SCORE_TEMPLATE = _.template($('#score-element').html());
    var scoreElement = callWithVotes(function(up, down) {
        var voted = null;
        if (thisUser) {
            if (up.indexOf(thisUser.ref.toString()) != -1) voted = 'up';
            else if (down.indexOf(thisUser.ref.toString()) != -1) voted = 'down';
        }
        return SCORE_TEMPLATE({
            voted: voted,
            showVotes: thisUser != null
        });
    });

    var VOTE_COUNT_TEMPLATE = _.template($('#vote-count-template').html());
    var voteCountElement = callWithVotes(function(up, down) {
        var upCount = up.length ? "+" + up.length : "0";
        var downCount = down.length ? "-" + down.length : "0";
        return VOTE_COUNT_TEMPLATE({
            upCount: upCount,
            downCount: downCount
        });
    });

    var STORY_TEMPLATE = _.template($('#story-template').html());
    var render = function() {
        var ul = $('#links');
        ul.empty();
        if (stories.length) {
            sortScorable(stories);
            for (var i = 0; i < stories.length; ++i) {
                var story = stories[i];
                var story_data = story.val();
                var score = scoreElement(story_data);
                var voteCount = voteCountElement(story_data);
                var refString = story.ref().toString();
                li = $(STORY_TEMPLATE({
                    scoreWidget: score,
                    link: story_data.link,
                    title: story_data.title,
                    refString: refString,
                    voteCount: voteCount
                }));
                ul.append(li);
                // this was expanded. Make sure it still is to avoid resetting the ui
                if (expanded.indexOf(refString) != -1) toggleComments(refString);
            }
        } else {
            ul.append($('<li>No stories yet</li>'));
        }
    }

    var thisUser = null;
    var handleAuth = function() {
        var login = function(username, remember) {
            $('#login-div').hide();
            $('#submit-div').show();
            $('#user-display').text(username);
            thisUser = {name: username, ref: USERS.child(username)};
            render();
            if (remember) {
                $.cookie('username', username);
            } else {
                $.cookie('username', null);
            }
        };
        $('#login').click(function(event) {
            var username = $('#username').val();
            var remember = typeof($('#remember').attr('checked')) != 'undefined';
            USERS.child(username).transaction(function(userData) {
                if (!userData || remember != userData.remember) {
                    return {remember: remember};
                }
            }, function(success) {
                login(username, remember);
            });
        });
        $('#submit-div').hide();
        var cookiedUser = $.cookie('username');
        if (cookiedUser) {
            login(cookiedUser, true);
        }
    };

    var logout = function() {
        $('#login-div').show();
        $('#submit-div').hide();
        $.cookie('username', null);
        thisUser = null;
        render();
    };

    var getStory = function(refString) {
        for (var i = 0; i < stories.length; ++i) {
            var story = stories[i];
            if (story.ref().toString() == refString) {
                return story;
            }
        }
        return null;
    };

    var getComment = function(refString) {
        var i = refString.indexOf('comments');
        var storyRefString = refString.substr(0, i - 1);
        var parent = getStory(storyRefString).val();
        var sub = refString.substr(i);
        do {
            sub = sub.substr('comments'.length + 1);
            var nextI = sub.indexOf('/');
            if (nextI == -1) nextI = sub.length;
            var cIndex = parseInt(sub.substr(0, nextI));
            sub = sub.substr(nextI + 1);
            parent = parent.comments[cIndex];
        } while (sub.indexOf('comments') != -1);
        return parent;
        //var index = refString.lastIndexOf('/');
        //var commentId = parseInt(refString.substring(index + 1));
        //return story.val().comments[commentId];
    }

    var removeVote = function(listNode, userRef) {
        listNode.transaction(function(listData) {
            var index = listData.indexOf(userRef);
            if (index != -1) {
                listData.splice(index, 1);
            }
            return listData;
        }, function(success) {
            if (!success) console.warn('removing a vote failed');
        });
    };

    var addVote = function(listNode, userRef) {
        listNode.transaction(function(listData) {
            if (listData) {
                var index = listData.indexOf(userRef);
                if (index == -1) {
                    listData.push(userRef);
                }
            } else {
                listData = [userRef];
            }
            return listData;
        }, function(success) {
            if (!success) console.warn('voting failed');
        });
    };

    var findScorable = function(li) {
        var refString = li.attr('id');
        if (li.hasClass('story')) {
            return getStory(refString).val();
        } else if (li.hasClass('comment')) {
            return getComment(refString);
        }
    };

    var handleVote = function(event) {
        event.preventDefault();
        var a = $(event.target);
        var isUpvote = a.hasClass('up');
        var li = a.closest('li');
        var ref = li.attr('id');
        var scorable = findScorable(li);
        var scorableNode = new Firebase(ref);
        var userRef = thisUser.ref.toString();
        var addList = isUpvote ? scorable.up || [] : scorable.down || [];
        var addNode = scorableNode.child(isUpvote ? 'up' : 'down');
        var removeList = isUpvote ? scorable.down || [] : scorable.up || [];
        if (addList.indexOf(userRef) != -1) {
            // this is just removing a vote
            removeVote(addNode, userRef);
        } else {
            // do the vote
            addVote(addNode, userRef);
            if (removeList.indexOf(userRef) != -1) {
                // need to remove old vote as well
                var removeNode = scorableNode.child(isUpvote ? 'down' : 'up');
                removeVote(removeNode, userRef);
            }
        }
    };

    LINKS.on('child_added', storyAdded);
    LINKS.on('child_changed', storyChanged);
    $('#submit').click(handleSubmit);
    $('#logout').click(logout);
    $(document).on('click', '.vote', handleVote);
    $(document).on('click', '.comments-opener', showCommentsHandler);
    $(document).on('click', '.comment-reply', replyHandler);
    $(document).on('click', '.comment-submit', replySubmit);
    handleAuth();
});
